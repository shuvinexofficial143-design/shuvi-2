#!/usr/bin/env python3
"""M-AI16 audit of direct native State edits, NOT only Session.execute."""
import argparse, hashlib, json, os, re
from pathlib import Path
ROOT=Path("original-editors/Shuvi2-Motion/crates/ui-egui/src")
REQUIRED={
 "panels/viewer.rs":[
    "manual_transaction(|| { app.session.open_comp(oc);",
    "manual_transaction(|| { app.session.open_comp(*item);",
    "manual_transaction(|| { app.session.set_time(cti +"],
 "panels/timeline.rs":[
    "manual_transaction(|| { app.session.state.project_selection = items;",
    "manual_transaction(|| { app.session.set_time(tt);",
    "manual_transaction(|| { app.session.history.merge_key = None;"],
 "control.rs":["manual_transaction(|| app.session.set_resolution(cid, res).map_err"],
 "panels/layer_styles_dialog.rs":[
    "fn checkpoint(app: &mut EffectcraftApp) -> Result<Checkpoint, String>",
    "app.motion_owner_gate.manual_transaction(|| {",
    "let result = gate.manual_transaction(|| {",
    "session.project = checkpoint.project;",
    "session.history = checkpoint.history;"]
}
TEST_MOD=re.compile(r"(?m)^\s*#\[cfg\(test\)\]\s*(?:#\[[^\n]*\]\s*)*mod\s+\w*tests\b")
METHOD=re.compile(r"\b(?:app|self)\.session\.(?:set_time|open_comp|activate_comp|activate_comp_none|replace_project|set_resolution|mark_saved|sanitize_after_replacement|save|restore_view)\s*\(")
ASSIGN=re.compile(r"\b(?:app|self)\.session\.(?:project|saved_project|history(?:\.\w+)?|state(?:\.\w+)?|path|prefs(?:\.\w+)?)\s*=(?!=)")
COW=re.compile(r"(?:Arc|std::sync::Arc)::make_mut\\s*\\(\\s*&mut\\s*(?:app|self)\\.session\\.project")
CONTAINER_MUTATION=re.compile(r"\\b(?:app|self)\\.session\\.(?:project|history|state|prefs)\\.(?:\\w+\\.)*(?:push|clear|retain|extend|insert|remove|append|sort|drain|swap|truncate)\\s*\\(")
RAW_PROJECT=re.compile(r"\b(?:app|self)\.session\.project\s*=(?!=)")
def runtime(text):
    m=TEST_MOD.search(text)
    return text[:m.start()] if m else text
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",default="motion-state-mutation-audit.json")
    args=ap.parse_args()
    errors=[]
    anchored={}
    for rel, needles in REQUIRED.items():
        file=ROOT/rel
        if not file.is_file():
            errors.append("Missing original native file "+rel)
            continue
        src=runtime(file.read_text())
        anchored[rel]=0
        for needle in needles:
            if needle not in src:
                errors.append("Missing owner transaction: "+rel+": "+needle)
            else:
                anchored[rel]+=1
    findings=[]
    raw=[]
    inline_gated=[]
    needs_review=[]
    for path in sorted(ROOT.rglob("*.rs")):
        rel=path.relative_to(ROOT).as_posix()
        if path.name=="tests.rs" or "tests" in path.relative_to(ROOT).parts:
            continue
        for ln, line in enumerate(runtime(path.read_text()).splitlines(),1):
            t=line.strip()
            if t.startswith("//") or t.startswith("///"):
                continue
            if METHOD.search(line) or ASSIGN.search(line) or COW.search(line) or CONTAINER_MUTATION.search(line):
                finding={"file":rel,"line":ln,"source":t[:180],
                    "containerMutation":bool(CONTAINER_MUTATION.search(line))}
                findings.append(finding)
                if "motion_owner_gate.manual_transaction(" in line:
                    inline_gated.append(finding)
                else:
                    # Unreviewed here does not prove unsafe: a trusted
                    # multiline owner transaction can surround this line.
                    needs_review.append(finding)
            if RAW_PROJECT.search(line) or COW.search(line):
                raw.append({"file":rel,"line":ln,"source":t[:180]})
    if raw:
        errors.append("Unwrapped app/self project replacements found: "+str(len(raw)))
    source=runtime((ROOT/"panels/layer_styles_dialog.rs").read_text())
    parts=source.split("pub fn finish(app: &mut EffectcraftApp, ok: bool) {")
    if len(parts)!=2 or "let result = gate.manual_transaction(|| {" not in parts[1] or "session.project = checkpoint.project;" not in parts[1]:
        errors.append("Layer Style snapshot restore escaped owner transaction")
    evidence={
        "schemaVersion":1,"sourceCommit":os.getenv("GITHUB_SHA","local"),
        "reviewedNativeStateGateAnchors":anchored,
        "trackedDirectSetterOrStateCandidates":findings,
        "reviewedInlineOwnerTransactionCandidates":inline_gated,
        "furtherStateMutationReviewCandidates":needs_review,
        "unguardedAppProjectReplacement":raw,
        "fullNativeOwnerLockVerified":False,
        "crossProcessExclusiveLock":False,
        "sqliteHostWiredToDesktop":False,
        "productionAiEditingEnabled":False,
        "limitations":["Static regex inventory is not exhaustive",
                       "Some direct setter candidates may be read-only or safely guarded",
                       "Windows Rust and real UI E2E must verify all edits"],
        "errors":errors
    }
    dest=Path(args.out)
    dest.write_text(json.dumps(evidence,indent=2,sort_keys=True)+"\n")
    print("M-AI16 state gate anchors:",sum(anchored.values()))
    print("Direct setter/state/container mutation candidates:",len(findings))
    print("Inline owner transaction candidates:",len(inline_gated))
    print("Further state mutation review candidates:",len(needs_review))
    print("Raw unguarded app project swaps:",len(raw))
    print("Evidence SHA256:",hashlib.sha256(dest.read_bytes()).hexdigest())
    for e in errors:print("ERROR:",e)
    if errors:raise SystemExit(1)
if __name__=="__main__":
    main()

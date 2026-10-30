#!/usr/bin/env python3
"""M-AI14 static audit of ORIGINAL egui native command entry points.

Does not claim total editor-wide locking. Direct Session mutation paths that
remain elsewhere are emitted as unresolved inventory, not silently omitted.
No third-party packages or trust in a model/renderer response required.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

UI = Path("original-editors/Shuvi2-Motion/crates/ui-egui/src")
MIGRATED = {
    "panels/viewer.rs": 36,
    "panels/timeline.rs": 5,
    "panels/paint_panels.rs": 2,
    "panels/text_panels.rs": 2,
    "panels/anim_tools.rs": 4,
    "panels/key_dialogs.rs": 5,
    "panels/layer_panel.rs": 3,
    "panels/roto_tool.rs": 7,
    "panels/viewer_tools.rs": 11,
    "panels/markers_ui.rs": 15,
    "panels/forms.rs": 4,
    "panels/templates.rs": 8,
    "panels/essential.rs": 1,
    "panels/viewer_text.rs": 1,
    "panels/settings.rs": 1,
    "app/frame.rs": 1,
}
GATE = "app.motion_owner_gate.manual_menu_command(&mut app.session, "
assert sum(MIGRATED.values()) == 106

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="motion-owner-route-audit.json")
    args = ap.parse_args()
    errors = []
    measured = {}
    for file, expected in MIGRATED.items():
        path = UI / file
        if not path.is_file():
            errors.append(f"Missing selected original native source: {file}")
            continue
        src = path.read_text(encoding="utf-8")
        if file == "app/frame.rs":
            count = src.count("self.motion_owner_gate.manual_menu_command(&mut self.session, ")
            if 'self.session.execute("file.watchFolder.poll",' in src:
                errors.append("app/frame.rs file watcher bypasses owner admission")
        else:
            count = src.count(GATE)
            if "app.session.execute(" in src or "app.session.execute_checked(" in src:
                errors.append(f"Direct native execute reintroduced in {file}")
        if count < expected:
            errors.append(f"{file}: expected >= {expected} guarded native commands; got {count}")
        measured[file] = count

    entry_checks = {
        "app owns gate": (UI / "lib.rs", "motion_owner_gate: shuvi_owner_gate::MotionOwnerGate"),
        "app constructs gate": (UI / "app.rs", "motion_owner_gate: crate::shuvi_owner_gate::MotionOwnerGate::default()"),
        "menu dispatcher owns manual admission": (UI / "menus/frontend.rs", GATE),
        "control checked admission": (UI / "control.rs", "app.motion_owner_gate.manual_control_command(&mut app.session, id, params)"),
        "control offload admission": (UI / "control.rs", "app.motion_owner_gate.manual_control_command(&mut app.session, id, p)"),
        "guarded lease only in tests": (UI / "shuvi_owner_gate.rs", "fn guarded_for_test(&self)"),
        "real desktop AI disabled": (UI / "shuvi_owner_gate.rs", "production AI editing disabled"),
        "original owner permit remains private": (UI / "shuvi_motion_owner.rs", "pub(crate) struct OwnerPermit { _private: () }"),
        "original AI approval UI remains disabled": (UI / "panels/shuvi_ai.rs", 'ui.add_enabled(false, egui::Button::new("Approve & execute — not integrated"))'),
    }
    for name, (file, needle) in entry_checks.items():
        if not file.is_file() or needle not in file.read_text(encoding="utf-8"):
            errors.append(f"Critical entrypoint invariant missing: {name}")

    # Deliberately inventory other direct Session calls rather than claiming
    # the current manual gate covers all editor mutating paths.
    unresolved = []
    for path in sorted(UI.rglob("*.rs")):
        rel = path.relative_to(UI).as_posix()
        if rel in MIGRATED:
            continue
        content = path.read_text(encoding="utf-8")
        for no, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("///"):
                continue
            if any(v in stripped for v in (
                "app.session.execute(", "app.session.execute_checked(",
                "self.session.execute(", "self.session.execute_checked(",
                "app.session.project =", "self.session.project =",
            )):
                unresolved.append({"file":rel,"line":no,"source":stripped[:160]})
    # All source strings are auditable and no run artifact includes credentials.
    evidence = {
        "schemaVersion": 1,
        "workstream": "Shuvi 2.0.2 Motion M-AI14",
        "sourceCommit": os.getenv("GITHUB_SHA", "local"),
        "guardedManualCommandMinimum": 106,
        "guardedManualCommandMeasured": sum(measured.values()),
        "guardedSources": measured,
        "remainingDirectSessionCalls": unresolved,
        "completeDesktopMutationLock": False,
        "productionAiEditingEnabled": False,
        "ciGates": "static source routes only; Windows compilation and runtime tests separately required",
        "failures":errors,
    }
    dest = Path(args.out)
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Owner gate static audit: {sum(measured.values())} routed manual commands in {len(measured)} original UI files")
    print(f"Unresolved possible direct Session calls: {len(unresolved)} (NOT claimed secured)")
    print("Evidence SHA256:", hashlib.sha256(dest.read_bytes()).hexdigest())
    for item in errors:
        print("ERROR:", item)
    if errors:
        raise SystemExit(1)

if __name__ == "__main__":
    main()

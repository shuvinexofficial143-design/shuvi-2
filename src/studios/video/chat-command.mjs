/**
 * Safe deterministic chat command parser. NOT an AI model.
 * Produces exactly one typed FilmCraft action; never executes anything.
 */
export function parseVideoChat(input,ctx){
  if(typeof input!=="string"||input.length>280||!ctx||
    !/^[a-f0-9]{64}$/.test(ctx.projectSha256??""))
    return {ok:false,message:"Open a verified project and enter a short instruction."};
  const source=input.trim().toLowerCase().replace(/\s+/g," ");
  // Intentionally narrow, anchored Hindi commands. Unknown colloquial requests
  // are refused instead of guessed. They use the SAME native allowlist below.
  function canonicalHindi(s) {
    let m;
    if(s==="पिछला बदलाव वापस करो")return "undo";
    if(s==="बदलाव दोबारा करो")return "redo";
    if(s==="चयनित क्लिप हटाओ")return "delete selected";
    if((m=/^चयनित क्लिप को (\d+(?:\.\d{1,6})?) सेकंड पर काटो$/.exec(s)))
      return "split selected at "+m[1];
    if((m=/^क्लिप #([1-9]\d*) को (\d+(?:\.\d{1,6})?) सेकंड पर काटो$/.exec(s)))
      return "split #"+m[1]+" at "+m[2];
    if((m=/^चयनित क्लिप को ([va](?:[1-9]|1[0-6])) ट्रैक पर (\d+(?:\.\d{1,6})?) सेकंड पर ले जाओ$/.exec(s)))
      return "move selected to "+m[1]+" at "+m[2];
    if((m=/^चयनित मीडिया को ([va](?:[1-9]|1[0-6])) ट्रैक पर (\d+(?:\.\d{1,6})?) सेकंड पर लगाओ$/.exec(s)))
      return "place selected on "+m[1]+" at "+m[2];
    if((m=/^चयनित क्लिप के (शुरू|अंत) से (-?\d+) फ्रेम ट्रिम करो$/.exec(s)))
      return "trim selected "+(m[1]==="शुरू"?"in":"out")+" "+m[2]+" frames";
    return s;
  }
  const text=canonicalHindi(source);
  const bad=(message)=>({ok:false,message});
  const ok=(action,summary)=>({ok:true,action,summary,
    expectedProjectSha256:ctx.projectSha256,selectedRoot:ctx.selectedRoot,projectPath:ctx.projectPath});
  const clip=(id)=>ctx.clips?.find(c=>c.clipId===(id==="selected"?ctx.selectedClipId:Number(id.slice(1))));
  const media=(id)=>ctx.media?.find(c=>c.itemId===(id==="selected"?ctx.selectedMediaId:Number(id.slice(1))));
  let m;
  if(text==="undo"||text==="redo")return ok({type:text},text+" last saved project edit");
  if((m=/^split (selected|#[1-9]\d*) at (\d+(?:\.\d{1,6})?)$/.exec(text))){
    const c=clip(m[1]),seconds=Number(m[2]);
    if(!c||seconds<=c.start||seconds>=c.start+c.duration)return bad("Split must fall inside a real FilmCraft clip.");
    return ok({type:"split",clipId:c.clipId,seconds},"Split #"+c.clipId+" at "+seconds+"s");
  }
  if((m=/^move (selected|#[1-9]\d*) to ([va](?:[1-9]|1[0-6])) at (\d+(?:\.\d{1,6})?)$/.exec(text))){
    const c=clip(m[1]),seconds=Number(m[3]),track=m[2].toUpperCase();
    if(!c||seconds>86400||(c.kind==="video"&&!track.startsWith("V"))||(c.kind==="audio"&&!track.startsWith("A")))
      return bad("Clip, destination track or time invalid.");
    return ok({type:"move",clipId:c.clipId,track,seconds,insert:false},"Move #"+c.clipId+" to "+track+" at "+seconds+"s");
  }
  if((m=/^trim (selected|#[1-9]\d*) (in|out) (-?\d+) frames?( ripple)?$/.exec(text))){
    const c=clip(m[1]),deltaFrames=Number(m[3]);
    if(!c||!Number.isInteger(deltaFrames)||deltaFrames===0||Math.abs(deltaFrames)>144000)
      return bad("Trim needs a real clip and nonzero frame delta.");
    return ok({type:"trim",clipId:c.clipId,edge:m[2],deltaFrames,ripple:Boolean(m[4])},"Trim #"+c.clipId+" "+m[2]+" by "+deltaFrames+" frames");
  }
  if((m=/^delete (selected|#[1-9]\d*)( ripple)?$/.exec(text))){
    const c=clip(m[1]);if(!c)return bad("Select an existing clip to delete.");
    return ok({type:"delete",clipId:c.clipId,ripple:Boolean(m[2])},"Delete native clip #"+c.clipId);
  }
  if((m=/^place (selected|#[1-9]\d*) on ([va](?:[1-9]|1[0-6])) at (\d+(?:\.\d{1,6})?)$/.exec(text))){
    const c=media(m[1]),seconds=Number(m[3]),track=m[2].toUpperCase(),audio=track.startsWith("A");
    if(!c||seconds>86400)return bad("Select imported media and a valid timestamp.");
    return ok({type:"place",itemId:c.itemId,track,seconds,video:!audio,audio},"Place media #"+c.itemId+" on "+track+" at "+seconds+"s");
  }
  return bad("No AI model connected. Supported local commands: split selected at 0.5; move selected to V2 at 2; trim selected out -3 frames; delete selected; place selected on V1 at 0; undo; redo.");
}

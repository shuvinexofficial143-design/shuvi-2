/** Render only factual metadata from EffectCraft layer list; native currently
 * exposes a keyframe count. Do not manufacture keyframe times or value curves.
 */
export function keyframeReadback(layer){
  const count=layer?.keyframes;
  if(Number.isSafeInteger(count)&&count>=0&&count<=100000)
    return {verified:true,count,label:count+" native keyframe"+(count===1?"":"s")+" · times unavailable"};
  return {verified:false,count:null,label:"Native keyframe count unavailable"};
}

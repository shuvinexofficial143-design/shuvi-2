/** Pure time ruler calculations from real FilmCraft timeline metadata. */
export function rulerTicks(viewport,maxTicks=12){
  if(!viewport||!Number.isFinite(viewport.start)||!Number.isFinite(viewport.duration)||
    viewport.duration<=0||!Number.isInteger(maxTicks)||maxTicks<2||maxTicks>100)return [];
  const target=viewport.duration/(maxTicks-1);
  const exponent=Math.floor(Math.log10(target));
  const scale=10**exponent;
  const step=[1,2,5,10].find(m=>m*scale>=target)*scale;
  const result=[];
  const first=Math.ceil((viewport.start-1e-9)/step);
  for(let n=first;n<first+maxTicks+2;n++){
    const time=Number((n*step).toFixed(9));
    if(time<viewport.start-1e-8)continue;
    if(time>viewport.end+1e-8)break;
    result.push({seconds:time,percent:(time-viewport.start)/viewport.duration*100});
  }
  return result;
}
export function rulerSeekTime(clientX,rect,viewport,fps){
  if(!viewport||!rect||!Number.isFinite(clientX)||!Number.isFinite(rect.left)||
    !Number.isFinite(rect.width)||rect.width<=0||
    !Number.isFinite(viewport.start)||!Number.isFinite(viewport.duration)||
    !Number.isFinite(viewport.total)||viewport.total<=0||
    !Number.isFinite(fps)||fps<1||fps>240)return null;
  const ratio=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
  const time=viewport.start+ratio*viewport.duration;
  // A FilmCraft frame starts before end-of-sequence, never at EOF.
  const last=Math.max(0,Math.floor(viewport.total*fps-1e-8)-1);
  const frame=Math.max(0,Math.min(last,Math.round(time*fps)));
  return frame/fps;
}
export function percentOnRuler(time,viewport){
  if(!viewport||!Number.isFinite(time)||time<viewport.start||time>viewport.end)return null;
  return Math.max(0,Math.min(100,(time-viewport.start)/viewport.duration*100));
}

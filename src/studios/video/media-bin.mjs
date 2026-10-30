/** Read-only, bounded user-visible FilmCraft imported media browser.
 * This module never invents media from local filesystem or fetches thumbnails.
 */
export function mediaBinView(items,search="",max=120){
  if(!Array.isArray(items)||typeof search!=="string"||!Number.isInteger(max)||max<1||max>500)
    return {total:0,matching:0,items:[]};
  const query=search.trim().toLocaleLowerCase();
  const real=items.filter(x=>x&&Number.isSafeInteger(x.itemId)&&x.itemId>0&&
    typeof x.name==="string"&&typeof x.type==="string");
  const filtered=query?real.filter(x=>
    x.name.toLocaleLowerCase().includes(query)||
    x.type.toLocaleLowerCase().includes(query)||
    String(x.itemId).includes(query)):real;
  return {total:real.length,matching:filtered.length,items:filtered.slice(0,max)};
}
export function mediaBinKind(item) {
  const type=String(item?.type??"").toLocaleLowerCase();
  return /video|movie|clip|mpeg|mp4|mov|avc/.test(type)?"Video":
    /audio|sound|wave|wav|mp3|aac/.test(type)?"Audio":"Media";
}

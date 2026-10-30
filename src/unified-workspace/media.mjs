/** Native FilmCraft inspect/project is the only media-library source.
 * Bin folders can contain both an item id and nested children. Do not discard
 * their descendants; reject malformed ids and keep media scoped to this project.
 */
export function projectMediaItems(project) {
  const root=project?.root;
  const seen=new Set();
  const output=[];
  function visit(node,parents,depth){
    if(!node || typeof node!=="object" || depth>64)return;
    const name=typeof node.name==="string"?node.name.trim():"";
    const type=String(node.type??"").toLowerCase();
    const id=node.item;
    if(Number.isSafeInteger(id) && id>0 && !type.includes("sequence") && !seen.has(id)){
      seen.add(id);
      output.push({id,name:name||"Imported media",location:parents.join(" / ")});
    }
    if(!Array.isArray(node.children))return;
    const next=name?[...parents,name]:parents;
    for(const child of node.children)visit(child,next,depth+1);
  }
  visit(root,[],0);
  return output;
}
export function selectedNativeMedia(project,rawId){
  if(typeof rawId!=="string" || !/^[1-9][0-9]*$/.test(rawId))
    throw Error("Choose an imported FilmCraft media item");
  const id=Number(rawId);
  const found=projectMediaItems(project).find(item=>item.id===id);
  if(!found)throw Error("Selected media is absent from the latest native FilmCraft project readback");
  return found;
}

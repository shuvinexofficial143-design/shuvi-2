/** U09 independent Motion post-mutation proof from native EffectCraft receipts
 * and a stable second snapshot. No model-provided state or guessed keyframe times.
 */
const validId=v=>Number.isSafeInteger(v)&&v>0;
const same=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-5;
const fail=reason=>({ok:false,reason});
const pass=()=>({ok:true});
const effectId=kind=>kind==="gaussianBlur"?"ec.blur.gaussian":
  kind==="brightnessContrast"?"ec.color.brightnesscontrast":null;
export function verifyMotionEdit({request,receipt,beforeLayers,afterLayers,inspector}){
  if(!request||typeof request!=="object"||!Array.isArray(beforeLayers)||
    !Array.isArray(afterLayers)||!receipt||typeof receipt!=="object"||
    Array.isArray(receipt))return fail("Native Motion proof is incomplete");
  const type=request.action;
  const old=beforeLayers.find(x=>x.id===request.layerId);
  const after=afterLayers.find(x=>x.id===request.layerId);
  const fx=inspector?.effects,masks=inspector?.masks;
  const currentFx=()=>Array.isArray(fx)?fx.find(x=>x.uid===request.uid):null;
  const currentMask=()=>Array.isArray(masks)?masks.find(x=>x.uid===request.uid):null;
  if(type==="addText"||type==="addShape"){
    if(!validId(receipt.id)||beforeLayers.some(x=>x.id===receipt.id))
      return fail("Native created layer ID is missing or already existed");
    const saved=afterLayers.find(x=>x.id===receipt.id);
    const kind=type==="addText"?"text":"shape";
    if(!saved||String(saved.kind).toLowerCase()!==kind||
      saved.name!==request.name||receipt.name!==saved.name||
      receipt.id!==saved.id||String(receipt.kind).toLowerCase()!==kind)
      return fail("Created Motion layer does not match saved native identity");
    return pass();
  }
  if(["editText","setTransform","addKey","easeKeys"].includes(type)){
    if(!old||!after||receipt===null)return fail("Edited Motion layer not found in native readback");
    if(type==="editText"&&(!["text"].includes(String(after.kind).toLowerCase())||
      receipt.id!==request.layerId||String(receipt.kind).toLowerCase()!=="text"))
      return fail("Native source-text edit did not return the same text layer");
    if(type==="setTransform"){
      if(receipt.id!==request.layerId||receipt.revision!==after.revision)
        return fail("Native transform receipt does not match saved layer revision");
      const property=request.kind;
      const value=after[property];
      const receiptValue=receipt[property];
      if(property==="position"||property==="scale"){
        if(!Array.isArray(value)||!Array.isArray(receiptValue)||
          !same(value[0],request.x)||!same(value[1],request.y)||
          !same(receiptValue[0],value[0])||!same(receiptValue[1],value[1]))
          return fail("Native transform vector readback differs");
      }else if(["rotation","opacity"].includes(property)){
        if(!same(value,request.value)||!same(receiptValue,request.value))
          return fail("Native transform scalar readback differs");
      }else return fail("Unsupported native transform kind");
    }
    if(type==="addKey"||type==="easeKeys"){
      if(!Number.isSafeInteger(after.keyframes)||after.keyframes<0||
        !Number.isSafeInteger(old.keyframes)||after.keyframes<old.keyframes)
        return fail("EffectCraft keyframe count regressed or was not verified");
      // EffectCraft's native mutation verifies exact key time/value or easing.
      // layer_json only returns the aggregate count, not key timestamps.
    }
    return pass();
  }
  if(["addEffect","setEffectParameter","toggleEffect","removeEffect"].includes(type)){
    if(!after||!Array.isArray(fx))return fail("Native EffectCraft effect list was not read back");
    if(type==="addEffect"){
      if(!validId(receipt.uid)||receipt.id!==effectId(request.effect)||
        !fx.some(e=>e.uid===receipt.uid&&e.id===receipt.id))
        return fail("New native effect UID or kind missing from readback");
    }
    if(type==="removeEffect"){
      if(receipt.removed!==true||receipt.uid!==request.uid||currentFx())
        return fail("Removed native effect still exists or receipt is missing");
    }
    if(type==="toggleEffect"){
      if(!currentFx()||currentFx().enabled!==request.enabled||
        receipt.uid!==request.uid||receipt.enabled!==request.enabled)
        return fail("Native effect enablement differs from requested state");
    }
    if(type==="setEffectParameter"){
      if(!currentFx()||currentFx().id!==effectId(request.effect)||
        receipt.uid!==request.uid||receipt.parameter!==request.parameter||
        receipt.verified!==true||!same(receipt.value,request.value))
        return fail("Native effect parameter proof is missing");
    }
    return pass();
  }
  if(["addPolygonMask","setMaskVertex","removeMask","setMaskProperty"].includes(type)){
    if(!after||!Array.isArray(masks))return fail("Native EffectCraft mask list was not read back");
    if(type==="addPolygonMask"){
      const found=masks.find(m=>m.uid===receipt.uid);
      if(!validId(receipt.uid)||!found||found.closed!==true||
        !Array.isArray(found.vertices)||found.vertices.length!==request.vertices?.length)
        return fail("Native polygon mask UID or closed geometry missing");
    }
    if(type==="removeMask"&&
      (receipt.removed!==true||receipt.uid!==request.uid||currentMask()))
      return fail("Removed mask still exists or native receipt missing");
    if(type==="setMaskVertex"&&(!currentMask()||receipt.uid!==request.uid||
      !Array.isArray(currentMask().vertices)))
      return fail("Native mask vertex readback is incomplete");
    if(type==="setMaskProperty"&&(!currentMask()||receipt.uid!==request.uid))
      return fail("Native mask property receipt is incomplete");
    return pass();
  }
  return fail("Unsupported native Motion edit proof");
}

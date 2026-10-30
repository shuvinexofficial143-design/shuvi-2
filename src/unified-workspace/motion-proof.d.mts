export function verifyMotionEdit(args:{
 request:Record<string,any>;receipt:any;beforeLayers:any[];afterLayers:any[];
 inspector:null|{layer:any;effects:any[];masks:any[];revision:number}
}):{ok:true}|{ok:false;reason:string};

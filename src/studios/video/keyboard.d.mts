export declare function videoKeyboardCommand(
  event: {key?:string; ctrlKey?:boolean; shiftKey?:boolean; altKey?:boolean; metaKey?:boolean; isComposing?:boolean},
  editing:boolean,
): "undo"|"redo"|"back"|"forward"|null;

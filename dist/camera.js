export const DEFAULT_FIELD_ZOOM=1.2;
export const DEFAULT_FRONT_ZOOM=1;
export function defaultProductionZoom(width){return 2*Math.max(.25,Math.min(.62,width/1280))}

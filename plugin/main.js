let photoshop, app, action, core, imaging, batchPlay;
try {
photoshop = require("photoshop");
app = photoshop.app;
action = photoshop.action;
core = photoshop.core;
imaging = photoshop.imaging;
batchPlay = action.batchPlay;
} catch(e) {
console.log("Browser preview mode: Photoshop API not available. UI will still function.");
}

const statusEl = document.getElementById("status");

const controls = {
engine: document.getElementById("engine"),
threshold: document.getElementById("threshold"),
diffusion: document.getElementById("diffusion"),
transmissionClarity: document.getElementById("transmissionClarity"),
dotSize: document.getElementById("dotSize"),
signalResponse: document.getElementById("signalResponse"),
blackPoint: document.getElementById("blackPoint"),
whitePoint: document.getElementById("whitePoint")
};

const livePreviewToggle = document.getElementById("livePreview");
const resetEngineButton = document.getElementById("resetEngine");
const presetButtons = document.querySelectorAll(".presetButton");

let previewLayerID = null;
let previewSourceLayerID = null;
let previewSourceLayerName = "";
let suppressPreview = false;

let previewTimeout = null;
let previewBusy = false;
let previewPending = false;
let previewEnabled = livePreviewToggle ? livePreviewToggle.checked : false;

const engineDefaults = {
atkinson:{
threshold:128,
signalResponse:48,
blackPoint:0,
whitePoint:255,
dotSize:1,
diffusion:96,
transmissionClarity:0
},
floyd:{
threshold:128,
signalResponse:42,
blackPoint:0,
whitePoint:255,
dotSize:1,
diffusion:86,
transmissionClarity:0
}
};

const signalPresets = {
clean:{
label:"Lucid Transmission",
engine:"floyd",
threshold:128,
signalResponse:40,
blackPoint:0,
whitePoint:255,
dotSize:1,
diffusion:86,
transmissionClarity:8
},
ghost:{
label:"Ghost Print",
engine:"atkinson",
threshold:144,
signalResponse:34,
blackPoint:140,
whitePoint:244,
dotSize:1,
diffusion:92,
transmissionClarity:-8
},
veil:{
label:"Veil Drift",
engine:"floyd",
threshold:150,
signalResponse:28,
blackPoint:120,
whitePoint:250,
dotSize:1,
diffusion:96,
transmissionClarity:-15
},
echo:{
label:"Echo Field",
engine:"atkinson",
threshold:136,
signalResponse:38,
blackPoint:60,
whitePoint:245,
dotSize:1,
diffusion:100,
transmissionClarity:-5
}
};

let activePresetKey = null;
let suppressPresetClear = false;
let engineMemory = {};
let activeEngineKey = controls.engine ? controls.engine.value : "atkinson";
let suppressEngineMemory = false;
let engineBootReady = false;
let userChangedEngineControls = false;
const RANGE_MIN_GAP = 5;
let enforcingRange = false;

function updatePresetButtons(){
presetButtons.forEach(button=>{
button.classList.toggle("is-active", button.dataset.preset === activePresetKey);
});
}

function clearPresetSelection(){
if(suppressPresetClear){ return; }
activePresetKey = null;
updatePresetButtons();
}

function engineControlIds(){
return [
"threshold",
"signalResponse",
"blackPoint",
"whitePoint",
"dotSize",
"diffusion",
"transmissionClarity"
];
}

function captureEngineState(){
const state = {};
engineControlIds().forEach(id=>{
const el = controls[id];
if(el){ state[id] = Number(el.value); }
});
return state;
}

function saveActiveEngineState(){
if(suppressEngineMemory || !activeEngineKey){ return; }
engineMemory[activeEngineKey] = captureEngineState();
}

function applyEngineState(state){
suppressEngineMemory = true;
engineControlIds().forEach(id=>{
if(state[id] !== undefined && controls[id]){
setControlValue(id,state[id],false);
}
});
suppressEngineMemory = false;
}

function loadEngineState(engineKey, forceDefault){
const defaults = engineDefaults[engineKey] || engineDefaults.atkinson;
const stored = engineMemory[engineKey];
const state = forceDefault ? defaults : (stored || defaults);
applyEngineState(state);
engineMemory[engineKey] = captureEngineState();
}

function stringifyError(error){
if(!error){ return "Unknown error."; }
if(typeof error === "string"){ return error; }
if(error.message){ return error.message; }
try { return JSON.stringify(error); } catch(e) { return String(error); }
}

function setStatus(message){
if(statusEl){ statusEl.textContent = message; }
}

function clamp(v){
return Math.max(0, Math.min(255, v));
}

function rangeGray(value){
const v = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
return [v,v,v];
}

function getPalette(){
const black = controls.blackPoint ? Math.round(Number(controls.blackPoint.value) || 0) : 0;
const white = controls.whitePoint ? Math.round(Number(controls.whitePoint.value) || 255) : 255;
return {
label:"Range " + black + "-" + white,
colors:[rangeGray(black),rangeGray(white)]
};
}

function enforceRangeControls(activeId){
if(!controls.blackPoint || !controls.whitePoint){ return; }
let black = Math.round(Number(controls.blackPoint.value) || 0);
let white = Math.round(Number(controls.whitePoint.value) || 255);
black = Math.max(0, Math.min(250, black));
white = Math.max(5, Math.min(255, white));
if(black > white - RANGE_MIN_GAP){
if(activeId === "blackPoint"){
white = Math.min(255, Math.max(black + RANGE_MIN_GAP, white));
if(white > 255){
white = 255;
black = white - RANGE_MIN_GAP;
}
} else {
black = Math.max(0, Math.min(white - RANGE_MIN_GAP, black));
}
}
controls.blackPoint.value = String(black);
controls.whitePoint.value = String(white);
updateValueText("blackPoint");
updateValueText("whitePoint");
}

function applySignalResponseToLum(lum, response){
const strength = Math.max(0, Math.min(100, Number(response) || 0)) / 100;
let n = lum / 255;
n = Math.pow(n, 1.0 + strength * 0.85);
if(n < 0.42){ n *= (1.0 - strength * 0.18); }
if(n > 0.72){ n = 0.72 + ((n - 0.72) * (1.0 - strength * 0.35)); }
return clamp(n * 255);
}

function updateValueText(id){
const input = document.getElementById(id);
const valueDisplay = document.getElementById(id + "Value");
if(input && valueDisplay){ valueDisplay.textContent = Math.round(Number(input.value)); }
}

function setControlValue(id, value, dispatchChange = true){
const input = document.getElementById(id);
if(!input){ return; }

if(input.tagName && input.tagName.toLowerCase() === "select"){
input.value = String(value);
if(dispatchChange){ input.dispatchEvent(new Event("change", { bubbles: true })); }
return;
}

const min = Number(input.min);
const max = Number(input.max);
const v = Math.max(min, Math.min(max, value));
input.value = String(Math.round(v));
input.dispatchEvent(new Event("input", { bubbles: true }));
if(dispatchChange){ input.dispatchEvent(new Event("change", { bubbles: true })); }
}

function buildCustomSliders(){
const ranges = document.querySelectorAll("input[type=range]");
for(let i=0; i<ranges.length; i++){
const input = ranges[i];
const track = document.createElement("div");
track.className = "custom-slider-track";
const thumb = document.createElement("div");
thumb.className = "custom-slider-thumb";
track.appendChild(thumb);
input.parentNode.insertBefore(track, input.nextSibling);

function updateThumb(){
const min = Number(input.min);
const max = Number(input.max);
const val = Number(input.value);
const pct = (val - min) / (max - min);
thumb.style.left = (pct * 100) + "%";
track.style.setProperty("--fill", (pct * 100) + "%");
}
input.addEventListener("input", updateThumb);
updateThumb();

function onDrag(event){
const rect = track.getBoundingClientRect();
let pct = (event.clientX - rect.left) / rect.width;
pct = Math.max(0, Math.min(1, pct));
const min = Number(input.min);
const max = Number(input.max);
const val = min + pct * (max - min);
setControlValue(input.id, val, false);
}

track.addEventListener("pointerdown", (event)=>{
const glass = document.createElement("div");
glass.style.position = "fixed";
glass.style.top = "0";
glass.style.left = "0";
glass.style.width = "100vw";
glass.style.height = "100vh";
glass.style.zIndex = "9999";
glass.style.cursor = "pointer";
document.body.appendChild(glass);

onDrag(event);

function handleMove(e){ onDrag(e); }

function handleUp(){
glass.removeEventListener("pointermove", handleMove);
glass.removeEventListener("pointerup", handleUp);
window.removeEventListener("pointermove", handleMove);
window.removeEventListener("pointerup", handleUp);
if(glass.parentNode){ glass.parentNode.removeChild(glass); }
input.dispatchEvent(new Event("change", { bubbles: true }));
}

glass.addEventListener("pointermove", handleMove);
glass.addEventListener("pointerup", handleUp);
window.addEventListener("pointermove", handleMove);
window.addEventListener("pointerup", handleUp);
});
}
}

buildCustomSliders();
enforceRangeControls();

function queuePreview(){
if(!previewEnabled || suppressPreview){ return; }
if(previewTimeout){ clearTimeout(previewTimeout); }
previewTimeout = setTimeout(async ()=>{
if(previewBusy){
previewPending = true;
return;
}
previewBusy = true;
previewPending = false;
try{
await runVisualPreviewRender();
}catch(error){
console.error(error);
setStatus("Preview failed: " + stringifyError(error));
}
previewBusy = false;
if(previewPending){
previewPending = false;
queuePreview();
}
},260);
}

if(livePreviewToggle){
livePreviewToggle.addEventListener("change", async ()=>{
previewEnabled = livePreviewToggle.checked;
if(previewEnabled){
try{
ensureEngineBootState();
await core.executeAsModal(async ()=>{
await rememberPreviewSource();
},{commandName:"Remember SignalMirage Preview Source"});
setStatus("Preview on.");
queuePreview();
}catch(error){
previewEnabled = false;
livePreviewToggle.checked = false;
setStatus("Could not start live preview: " + stringifyError(error));
}
} else {
try{
await clearVisualPreview(true);
setStatus("Preview off.");
}catch(error){
setStatus("Live preview disabled, but cleanup failed: " + stringifyError(error));
}
}
});
}

["threshold","signalResponse","blackPoint","whitePoint","dotSize","diffusion","transmissionClarity"].forEach(id=>{
const el = document.getElementById(id);
if(!el){ return; }
el.addEventListener("input", ()=>{
if(enforcingRange){
updateValueText(id);
return;
}
if(id === "blackPoint" || id === "whitePoint"){
enforcingRange = true;
enforceRangeControls(id);
controls.blackPoint.dispatchEvent(new Event("input", { bubbles: true }));
controls.whitePoint.dispatchEvent(new Event("input", { bubbles: true }));
enforcingRange = false;
} else {
updateValueText(id);
}
if(!suppressEngineMemory){ userChangedEngineControls = true; }
clearPresetSelection();
saveActiveEngineState();
});
el.addEventListener("change", ()=>{
queuePreview();
});
updateValueText(id);
});

if(controls.engine){
controls.engine.addEventListener("change", ()=>{
clearPresetSelection();
saveActiveEngineState();
activeEngineKey = controls.engine.value;
loadEngineState(activeEngineKey,false);
setStatus("Engine loaded.");
queuePreview();
});
}

if(resetEngineButton){
resetEngineButton.addEventListener("click", ()=>{
clearPresetSelection();
const engineKey = controls.engine.value;
activeEngineKey = engineKey;
loadEngineState(engineKey,true);
setStatus("Defaults reset.");
queuePreview();
});
}

function applyPreset(presetKey){
const preset = signalPresets[presetKey];
if(!preset){ return; }
suppressPresetClear = true;
suppressEngineMemory = true;
suppressPreview = true;

if(controls.engine){
controls.engine.value = preset.engine;
activeEngineKey = preset.engine;
}

Object.keys(preset).forEach(key=>{
if(key === "label" || key === "engine"){ return; }
if(controls[key]){ setControlValue(key,preset[key],false); }
});

suppressEngineMemory = false;
engineMemory[activeEngineKey] = captureEngineState();
activePresetKey = presetKey;
updatePresetButtons();
suppressPresetClear = false;
suppressPreview = false;
setStatus("Preset: " + preset.label);
queuePreview();
}

if(presetButtons && presetButtons.length){
presetButtons.forEach(button=>{
button.addEventListener("click", ()=>{
applyPreset(button.dataset.preset);
});
});
}

function initializeEngineDefaults(){
if(!controls.engine){ return; }
if(!controls.engine.value){ controls.engine.value = "atkinson"; }
activeEngineKey = controls.engine.value || "atkinson";
loadEngineState(activeEngineKey,true);
engineBootReady = true;
userChangedEngineControls = false;
setStatus("READY");
}

function ensureEngineBootState(){
if(!controls.engine){ return; }
if(!engineBootReady){
initializeEngineDefaults();
return;
}
activeEngineKey = controls.engine.value || activeEngineKey || "atkinson";
if(!engineMemory[activeEngineKey]){
loadEngineState(activeEngineKey,true);
userChangedEngineControls = false;
}
}

initializeEngineDefaults();
setTimeout(()=>{
if(!userChangedEngineControls){ initializeEngineDefaults(); }
},0);

function applyPaletteColor(edited, dataIndex, color){
edited[dataIndex] = color[0];
edited[dataIndex + 1] = color[1];
edited[dataIndex + 2] = color[2];
}

function paletteLuminance(color){
return (0.299 * color[0]) + (0.587 * color[1]) + (0.114 * color[2]);
}

function nearestPaletteByLuminance(value, colors){
let bestIndex = 0;
let bestDistance = Infinity;
for(let i=0; i<colors.length; i++){
const distance = Math.abs(value - paletteLuminance(colors[i]));
if(distance < bestDistance){
bestDistance = distance;
bestIndex = i;
}
}
return bestIndex;
}

function nearestPaletteIndex(value, levels){
let bestIndex = 0;
let bestDistance = Infinity;
for(let i=0; i<levels.length; i++){
const distance = Math.abs(value - levels[i]);
if(distance < bestDistance){
bestDistance = distance;
bestIndex = i;
}
}
return bestIndex;
}

function tonalLevelsForPalette(colorCount){
if(colorCount === 2){ return [0,255]; }
if(colorCount === 3){ return [0,128,255]; }
return [0,85,170,255];
}

function mapDotSizeControl(value){
return Math.max(1, Math.min(2, Number(value) || 1));
}

function pixelateEditedByPalette(edited, components, width, height, colors, dotSize){
const size = Math.max(1, Math.round(dotSize || 1));
if(size <= 1){ return; }
for(let by=0; by<height; by+=size){
for(let bx=0; bx<width; bx+=size){
let sum = 0;
let count = 0;
for(let y=by; y<Math.min(height, by + size); y++){
for(let x=bx; x<Math.min(width, bx + size); x++){
const di = (y * width + x) * components;
sum += (0.299 * edited[di]) + (0.587 * edited[di + 1]) + (0.114 * edited[di + 2]);
count++;
}
}
const paletteIndex = nearestPaletteByLuminance(sum / Math.max(1,count), colors);
const color = colors[paletteIndex];
for(let y=by; y<Math.min(height, by + size); y++){
for(let x=bx; x<Math.min(width, bx + size); x++){
applyPaletteColor(edited,(y * width + x) * components,color);
}
}
}
}
}

async function duplicateActiveLayer(newName){
await batchPlay([{
"_obj":"duplicate",
"_target":[{"_ref":"layer","_enum":"ordinal","_value":"targetEnum"}],
"name":newName,
"_options":{"dialogOptions":"dontDisplay"}
}],{});
}

async function getActiveLayerFresh(){
const doc = app.activeDocument;
const layers = doc.activeLayers;
if(!layers || layers.length === 0){ throw new Error("No active layer found."); }
return {doc, layer: layers[0]};
}

async function selectLayerByID(layerID){
await batchPlay([{
"_obj":"select",
"_target":[{"_ref":"layer","_id":layerID}],
"makeVisible":true,
"_options":{"dialogOptions":"dontDisplay"}
}],{});
}

async function layerExists(layerID){
if(!layerID){ return false; }
try{
await batchPlay([{
"_obj":"get",
"_target":[{"_ref":"layer","_id":layerID}],
"_options":{"dialogOptions":"dontDisplay"}
}],{});
return true;
}catch(error){ return false; }
}

async function hideLayerByID(layerID){
if(!layerID){ return; }
try{
await batchPlay([{
"_obj":"hide",
"null":[{"_ref":"layer","_id":layerID}],
"_options":{"dialogOptions":"dontDisplay"}
}],{});
}catch(error){ console.warn("Could not hide preview layer", error); }
}

async function deleteLayerByID(layerID){
if(!layerID){ return; }
try{
const doc = app.activeDocument;
const layer = doc.layers.find(item => item.id === layerID);
if(layer && typeof layer.delete === "function"){
await layer.delete();
return;
}
}catch(error){ console.warn("Direct preview layer delete skipped", error); }
try{
await batchPlay([{
"_obj":"delete",
"_target":[{"_ref":"layer","_id":layerID}],
"_options":{"dialogOptions":"dontDisplay"}
}],{modalBehavior:"fail"});
}catch(error){
console.warn("Could not delete preview layer. Hiding it instead.", error);
await hideLayerByID(layerID);
}
}

async function renameActiveLayer(name){
await batchPlay([{
"_obj":"set",
"_target":[{"_ref":"layer","_enum":"ordinal","_value":"targetEnum"}],
"to":{"_obj":"layer","name":name},
"_options":{"dialogOptions":"dontDisplay"}
}],{});
}

async function rememberPreviewSource(){
const {layer} = await getActiveLayerFresh();
previewSourceLayerID = layer.id;
previewSourceLayerName = layer.name || "source layer";
}

async function clearVisualPreview(restoreSource){
if(!app || !core || !batchPlay){ return; }
await core.executeAsModal(async ()=>{
if(previewLayerID){
await deleteLayerByID(previewLayerID);
previewLayerID = null;
}
if(restoreSource && previewSourceLayerID && await layerExists(previewSourceLayerID)){
await selectLayerByID(previewSourceLayerID);
}
},{commandName:"Clear SignalMirage Live Preview"});
}

async function ensurePreviewLayer(settings){
if(previewLayerID && await layerExists(previewLayerID)){ return previewLayerID; }
await selectLayerByID(previewSourceLayerID);
await duplicateActiveLayer("SignalMirage LIVE PREVIEW - " + settings.engine + " - " + settings.paletteName);
await renameActiveLayer("SignalMirage LIVE PREVIEW - " + settings.engine + " - " + settings.paletteName);
const fresh = await getActiveLayerFresh();
previewLayerID = fresh.layer.id;
return previewLayerID;
}

function boxBlurGray(src,width,height,radius){
if(radius <= 0){ return src; }
let out = new Float32Array(src.length);
for(let y=0; y<height; y++){
for(let x=0; x<width; x++){
let sum = 0;
let count = 0;
for(let yy=-radius; yy<=radius; yy++){
for(let xx=-radius; xx<=radius; xx++){
let nx = x + xx;
let ny = y + yy;
if(nx >= 0 && nx < width && ny >= 0 && ny < height){
sum += src[ny * width + nx];
count++;
}
}
}
out[y * width + x] = sum / count;
}
}
return out;
}

function buildProcessor(settings){
return function(edited, components, width, height){
let gray = new Float32Array(width * height);
for(let y=0; y<height; y++){
for(let x=0; x<width; x++){
const pixelIndex = y * width + x;
const dataIndex = pixelIndex * components;
const r = edited[dataIndex] || 0;
const g = edited[dataIndex + 1] || 0;
const b = edited[dataIndex + 2] || 0;
let lum = (0.299 * r) + (0.587 * g) + (0.114 * b);
lum = applySignalResponseToLum(lum,settings.signalResponse);
gray[pixelIndex] = clamp(lum);
}
}

const clarity = Number(settings.transmissionClarity) || 0;

if(clarity < 0){
const blurRadius = Math.max(1, Math.round(Math.abs(clarity) / 34));
gray = boxBlurGray(gray,width,height,blurRadius);
}

if(clarity > 0){
const base = gray;
const soft = boxBlurGray(base,width,height,1);
const amount = clarity / 50;
let sharp = new Float32Array(base.length);
for(let i=0; i<base.length; i++){
sharp[i] = clamp(base[i] + (base[i] - soft[i]) * amount);
}
gray = sharp;
}

const colors = settings.palette.colors;
const levels = tonalLevelsForPalette(colors.length);
const counts = new Array(colors.length).fill(0);
const bias = 128 - settings.threshold;

function addError(x,y,error,factor){
if(x < 0 || x >= width || y < 0 || y >= height){ return; }
const idx = y * width + x;
gray[idx] = clamp(gray[idx] + error * factor * settings.diffusion);
}

function processPixel(x,y){
const idx = y * width + x;
const dataIndex = idx * components;
const oldValue = gray[idx];
const adjusted = clamp(oldValue + bias);
const paletteIndex = nearestPaletteIndex(adjusted,levels);
const error = adjusted - levels[paletteIndex];
counts[paletteIndex]++;
applyPaletteColor(edited,dataIndex,colors[paletteIndex]);

if(settings.engine === "floyd"){
addError(x + 1,y,error,7/16);
addError(x - 1,y + 1,error,3/16);
addError(x,y + 1,error,5/16);
addError(x + 1,y + 1,error,1/16);
}

if(settings.engine === "atkinson"){
addError(x + 1,y,error,1/8);
addError(x + 2,y,error,1/8);
addError(x - 1,y + 1,error,1/8);
addError(x,y + 1,error,1/8);
addError(x + 1,y + 1,error,1/8);
addError(x,y + 2,error,1/8);
}
}

for(let y=0; y<height; y++){
for(let x=0; x<width; x++){
processPixel(x,y);
}
}

pixelateEditedByPalette(edited,components,width,height,colors,settings.dotSize);
return {counts};
};
}

function currentSettings(){
const palette = getPalette();
return {
engine: controls.engine.value,
paletteMode: "two",
palette: palette,
paletteName: palette.label,
threshold: Number(controls.threshold.value),
signalResponse: controls.signalResponse ? Number(controls.signalResponse.value) : 45,
dotSize: controls.dotSize ? mapDotSizeControl(controls.dotSize.value) : 1,
dotSizeControl: controls.dotSize ? Number(controls.dotSize.value) : 1,
diffusion: Number(controls.diffusion.value) / 100,
transmissionClarity: controls.transmissionClarity ? Number(controls.transmissionClarity.value) : 0
};
}

async function runVisualPreviewRender(){
if(!app || !core || !imaging || !batchPlay){ return; }
ensureEngineBootState();
const settings = currentSettings();
let info = null;
await core.executeAsModal(async ()=>{
if(!previewSourceLayerID || !(await layerExists(previewSourceLayerID))){ await rememberPreviewSource(); }
const targetLayerID = await ensurePreviewLayer(settings);
info = await writePixelEffectFromSourceToTarget(previewSourceLayerID,targetLayerID,buildProcessor(settings));
await selectLayerByID(targetLayerID);
},{commandName:"Render SignalMirage Live Preview"});
if(info){ setStatus("Preview updated."); }
}

async function writePixelEffectFromSourceToTarget(sourceLayerID,targetLayerID,processor){
if(!app) throw new Error("Photoshop API missing. Cannot process image in browser.");
const doc = app.activeDocument;
const imageObj = await imaging.getPixels({
documentID: doc.id,
layerID: sourceLayerID,
colorSpace: "RGB",
componentSize: 8,
applyAlpha: false
});
const originalData = imageObj.imageData;
const pixels = await originalData.getData({chunky:true});
const bounds = imageObj.sourceBounds;
const width = bounds.right - bounds.left;
const height = bounds.bottom - bounds.top;
const components = originalData.components;
const componentSize = originalData.componentSize;
if(componentSize !== 8){
originalData.dispose();
throw new Error("Expected 8-bit pixel data. Try Image > Mode > 8 Bits/Channel.");
}
if(components < 3){
originalData.dispose();
throw new Error("Expected RGB pixel data.");
}
const edited = new Uint8Array(pixels.length);
edited.set(pixels);
const report = processor(edited,components,width,height);
const newImageData = await imaging.createImageDataFromBuffer(edited,{
width: width,
height: height,
components: components,
chunky: true,
colorSpace: "RGB",
colorProfile: "sRGB IEC61966-2.1"
});
await imaging.putPixels({
documentID: doc.id,
layerID: targetLayerID,
imageData: newImageData,
replace: true,
targetBounds: {left: bounds.left, top: bounds.top},
commandName: "SignalMirage Live Preview"
});
newImageData.dispose();
originalData.dispose();
return {width,height,report};
}

async function writePixelEffectToActiveLayer(processor){
if(!app) throw new Error("Photoshop API missing. Cannot process image in browser.");
const {doc, layer} = await getActiveLayerFresh();
const imageObj = await imaging.getPixels({
documentID: doc.id,
layerID: layer.id,
colorSpace: "RGB",
componentSize: 8,
applyAlpha: false
});
const originalData = imageObj.imageData;
const pixels = await originalData.getData({chunky:true});
const bounds = imageObj.sourceBounds;
const width = bounds.right - bounds.left;
const height = bounds.bottom - bounds.top;
const components = originalData.components;
const componentSize = originalData.componentSize;
if(componentSize !== 8){
originalData.dispose();
throw new Error("Expected 8-bit pixel data. Try Image > Mode > 8 Bits/Channel.");
}
if(components < 3){
originalData.dispose();
throw new Error("Expected RGB pixel data.");
}
const edited = new Uint8Array(pixels.length);
edited.set(pixels);
const report = processor(edited,components,width,height);
const newImageData = await imaging.createImageDataFromBuffer(edited,{
width: width,
height: height,
components: components,
chunky: true,
colorSpace: "RGB",
colorProfile: "sRGB IEC61966-2.1"
});
await imaging.putPixels({
documentID: doc.id,
layerID: layer.id,
imageData: newImageData,
replace: true,
targetBounds: {left: bounds.left, top: bounds.top},
commandName: "SignalMirage"
});
newImageData.dispose();
originalData.dispose();
return {width,height,report};
}

async function runEngine(){
const settings = currentSettings();
try{
let info = null;
setStatus("Applying SignalMirage...");
if(!core) throw new Error("Photoshop core not available in browser.");
suppressPreview = true;
await core.executeAsModal(async ()=>{
if(previewLayerID){
await deleteLayerByID(previewLayerID);
previewLayerID = null;
}
if(previewSourceLayerID){ await selectLayerByID(previewSourceLayerID); }
await duplicateActiveLayer("SignalMirage FINAL-V.1.5.0-RC - " + settings.engine + " - " + settings.paletteName);
info = await writePixelEffectToActiveLayer(buildProcessor(settings));
},{commandName:"Apply SignalMirage"});
suppressPreview = false;
if(livePreviewToggle && livePreviewToggle.checked){
livePreviewToggle.checked = false;
previewEnabled = false;
}
previewSourceLayerID = null;
setStatus("Done. Duplicate layer created.");
}catch(error){
suppressPreview = false;
console.error(error);
setStatus("Failed: " + stringifyError(error));
}
}

document.getElementById("applyEngine").onclick = runEngine;

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
paletteMode: document.getElementById("paletteMode"),
palette: document.getElementById("palette"),
threshold: document.getElementById("threshold"),
diffusion: document.getElementById("diffusion"),
transmissionClarity: document.getElementById("transmissionClarity"),
textureType: document.getElementById("textureType"),
textureAmount: document.getElementById("textureAmount"),
noise: document.getElementById("noise"),
edgeCharacter: document.getElementById("edgeCharacter"),
edgeStrength: document.getElementById("edgeStrength"),
signalResponse: document.getElementById("signalResponse")
};

const livePreviewToggle = document.getElementById("livePreview");

let previewLayerID = null;
let previewSourceLayerID = null;
let previewSourceLayerName = "";
let suppressPreview = false;

let previewTimeout = null;
let previewBusy = false;
let previewPending = false;
let previewEnabled = livePreviewToggle ? livePreviewToggle.checked : false;

const twoColorPalettes = {
ghostDance: {
label: "Ghost + Dance",
colors: [[173,173,173],[243,243,243]]
},
pureBW: {
label: "Pure Black + White",
colors: [[0,0,0],[255,255,255]]
}
};

const fourColorPalettes = {
midnightMoon: {
label: "Midnight Moon",
colors: [[36,36,38],[78,80,83],[159,161,162],[234,231,224]]
},
smokeSignals: {
label: "Smoke Signals",
colors: [[42,38,34],[107,102,95],[185,178,167],[244,238,229]]
}
};

const contaminationTones = {
none:{
label:"None",
primary:[0,0,0],
shadow:[0,0,0]
},
xeroxGrit:{
label:"Xerox Grit",
primary:[127,150,163],
shadow:[63,69,72]
},
fixerResidue:{
label:"Fixer Residue",
primary:[119,115,109],
shadow:[64,61,57]
}
};

function stringifyError(error){
if(!error){ return "Unknown error."; }
if(typeof error === "string"){ return error; }
if(error.message){ return error.message; }
try { return JSON.stringify(error); } catch(e) { return String(error); }
}

function setStatus(message){
statusEl.textContent = message;
}

function clamp(v){
return Math.max(0, Math.min(255, v));
}


function applySignalResponseToLum(lum, response){
const strength = Math.max(0, Math.min(100, Number(response) || 0)) / 100;
let n = lum / 255;
n = Math.pow(n, 1.0 + strength * 0.85);
if(n < 0.42){ n *= (1.0 - strength * 0.18); }
if(n > 0.72){ n = 0.72 + ((n - 0.72) * (1.0 - strength * 0.35)); }
return clamp(n * 255);
}

function rgbString(rgb){
return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
}

function activePaletteSet(){
return controls.paletteMode.value === "four" ? fourColorPalettes : twoColorPalettes;
}

function populatePaletteSelect(){
const set = activePaletteSet();
controls.palette.innerHTML = "";
Object.keys(set).forEach(key=>{
const option = document.createElement("option");
option.value = key;
option.textContent = set[key].label;
controls.palette.appendChild(option);
});
}

function getPalette(){
const set = activePaletteSet();
return set[controls.palette.value] || set[Object.keys(set)[0]];
}

function updatePalettePreview(){
const p = getPalette();
const preview = document.getElementById("palettePreview");
const swatches = preview.children;
for(let i=0; i<swatches.length; i++){
if(i < p.colors.length){
swatches[i].style.display = "block";
swatches[i].style.background = rgbString(p.colors[i]);
} else {
swatches[i].style.display = "none";
}
}
}

function updateValueText(id){
const input = document.getElementById(id);
const valueDisplay = document.getElementById(id + "Value");
valueDisplay.textContent = Math.round(Number(input.value));
}

function setControlValue(id, value){
const input = document.getElementById(id);
const min = Number(input.min);
const max = Number(input.max);
const v = Math.max(min, Math.min(max, value));
input.value = String(Math.round(v));
input.dispatchEvent(new Event("input", { bubbles: true }));
input.dispatchEvent(new Event("change", { bubbles: true }));
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
setControlValue(input.id, val);
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

function handleMove(e){
onDrag(e);
}

function handleUp(){
glass.removeEventListener("pointermove", handleMove);
glass.removeEventListener("pointerup", handleUp);
window.removeEventListener("pointermove", handleMove);
window.removeEventListener("pointerup", handleUp);
if(glass.parentNode) glass.parentNode.removeChild(glass);
}

glass.addEventListener("pointermove", handleMove);
glass.addEventListener("pointerup", handleUp);
window.addEventListener("pointermove", handleMove);
window.addEventListener("pointerup", handleUp);
});
}
}

buildCustomSliders();
populatePaletteSelect();
updatePalettePreview();

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
await core.executeAsModal(async ()=>{
await rememberPreviewSource();
},{commandName:"Remember SignalMirage Preview Source"});
setStatus("Live preview enabled. A temporary preview layer will update as you adjust.");
queuePreview();
}catch(error){
previewEnabled = false;
livePreviewToggle.checked = false;
setStatus("Could not start live preview: " + stringifyError(error));
}
} else {
try{
await clearVisualPreview(true);
setStatus("Live preview disabled. Temporary preview layer removed.");
}catch(error){
setStatus("Live preview disabled, but cleanup failed: " + stringifyError(error));
}
}
});
}

["threshold","diffusion","signalResponse","transmissionClarity","textureAmount","noise","edgeStrength"].forEach(id=>{
const el = document.getElementById(id);
el.addEventListener("input", ()=>{
updateValueText(id);
queuePreview();
});
updateValueText(id);
});

controls.paletteMode.addEventListener("change", ()=>{
populatePaletteSelect();
updatePalettePreview();
queuePreview();
});

controls.palette.addEventListener("change", ()=>{
updatePalettePreview();
queuePreview();
});

controls.engine.addEventListener("change", queuePreview);
controls.textureType.addEventListener("change", queuePreview);
if(controls.edgeCharacter){ controls.edgeCharacter.addEventListener("change", queuePreview); }

function pseudoRandom(x,y,seed){
let n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
return n - Math.floor(n);
}

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

function applyDryPlateEdges(edited, components, width, height, edgeSource, colors, strength){
if(strength <= 0){ return; }
const s = strength / 100;
const edgeThreshold = 22 + (1 - s) * 48;
const erosionChance = 0.06 + s * 0.36;
const liftChance = 0.025 + s * 0.16;

for(let y=1; y<height-1; y++){
for(let x=1; x<width-1; x++){
const idx = y * width + x;
const here = edgeSource[idx];
const right = edgeSource[idx + 1];
const left = edgeSource[idx - 1];
const up = edgeSource[idx - width];
const down = edgeSource[idx + width];
const edgeContrast = Math.max(
Math.abs(here - right),
Math.abs(here - left),
Math.abs(here - up),
Math.abs(here - down)
);

if(edgeContrast < edgeThreshold){ continue; }

const grain = pseudoRandom(x,y,707 + strength);
const skip = pseudoRandom(x,y,811 + strength);
const direction = pseudoRandom(x,y,919 + strength);
const dataIndex = idx * components;
const currentLum = (edited[dataIndex] + edited[dataIndex+1] + edited[dataIndex+2]) / 3;
let paletteIndex = nearestPaletteByLuminance(currentLum, colors);

if(grain < erosionChance){
if(direction < 0.58){
paletteIndex = Math.min(colors.length - 1, paletteIndex + 1);
} else {
paletteIndex = Math.max(0, paletteIndex - 1);
}
applyPaletteColor(edited,dataIndex,colors[paletteIndex]);
}

if(skip < liftChance){
const lifted = Math.min(colors.length - 1, paletteIndex + 1);
applyPaletteColor(edited,dataIndex,colors[lifted]);
}
}
}
}

function applyMeltEdges(edited, components, width, height, edgeSource, colors, strength){
if(strength <= 0){ return; }
const s = Math.min(strength,50) / 50;
const edgeThreshold = 18 + (1 - s) * 42;
const darkBleedChance = 0.08 + s * 0.34;
const softLiftChance = 0.015 + s * 0.12;
const driftRange = 1 + Math.floor(s * 2);

for(let y=1; y<height-1; y++){
for(let x=1; x<width-1; x++){
const idx = y * width + x;
const here = edgeSource[idx];
const right = edgeSource[idx + 1];
const left = edgeSource[idx - 1];
const up = edgeSource[idx - width];
const down = edgeSource[idx + width];
const edgeContrast = Math.max(
Math.abs(here - right),
Math.abs(here - left),
Math.abs(here - up),
Math.abs(here - down)
);

if(edgeContrast < edgeThreshold){ continue; }

const r1 = pseudoRandom(x,y,1201 + strength);
const r2 = pseudoRandom(x,y,1327 + strength);
const r3 = pseudoRandom(x,y,1451 + strength);
const dataIndex = idx * components;
const currentLum = (edited[dataIndex] + edited[dataIndex+1] + edited[dataIndex+2]) / 3;
let paletteIndex = nearestPaletteByLuminance(currentLum, colors);

let nx = x;
let ny = y;
if(r2 < 0.25){ nx = Math.max(0, x - driftRange); }
else if(r2 < 0.5){ nx = Math.min(width - 1, x + driftRange); }
else if(r2 < 0.75){ ny = Math.max(0, y - driftRange); }
else { ny = Math.min(height - 1, y + driftRange); }

const nIdx = ny * width + nx;
const nDataIndex = nIdx * components;
const neighborLum = (edited[nDataIndex] + edited[nDataIndex+1] + edited[nDataIndex+2]) / 3;
const neighborPaletteIndex = nearestPaletteByLuminance(neighborLum, colors);

if(r1 < darkBleedChance && neighborPaletteIndex < paletteIndex){
paletteIndex = Math.max(0, paletteIndex - 1);
applyPaletteColor(edited,dataIndex,colors[paletteIndex]);
}

if(r3 < softLiftChance){
const softened = Math.min(colors.length - 1, paletteIndex + 1);
applyPaletteColor(edited,dataIndex,colors[softened]);
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
if(!layers || layers.length === 0){
throw new Error("No active layer found.");
}
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
}catch(error){
return false;
}
}

async function hideLayerByID(layerID){
if(!layerID){ return; }
try{
await batchPlay([{
"_obj":"hide",
"null":[{"_ref":"layer","_id":layerID}],
"_options":{"dialogOptions":"dontDisplay"}
}],{});
}catch(error){
console.warn("Could not hide preview layer", error);
}
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
}catch(error){
console.warn("Direct preview layer delete skipped", error);
}
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
if(previewLayerID && await layerExists(previewLayerID)){
return previewLayerID;
}
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

function textureLuminance(lum,x,y,type,strength){
if(type === "none" || strength <= 0){ return lum; }
const noise = (pseudoRandom(x,y,strength) - 0.5) * strength;

if(type === "inkStain"){
lum += noise * 0.75;
if(pseudoRandom(x,y,11) < 0.014){ lum -= strength * 1.15; }
if(pseudoRandom(x,y,23) < 0.008){ lum += strength * 0.65; }
}

else if(type === "xeroxGrit"){
lum += noise * 0.95;
if(pseudoRandom(x,y,17) < 0.018){ lum -= strength * 1.45; }
if(pseudoRandom(x,y,31) < 0.012){ lum += strength * 0.45; }
}

else if(type === "fixerResidue"){
lum += noise * 1.15;
if(pseudoRandom(x,y,29) < 0.018){ lum -= strength * 0.9; }
if(pseudoRandom(x,y,37) < 0.018){ lum += strength * 0.55; }
}

return clamp(lum);
}

function applyContaminationColor(edited,dataIndex,lum,x,y,type,strength){
if(type === "none" || strength <= 0){ return; }
const tone = contaminationTones[type];
if(!tone){ return; }

const amount = Math.min(0.28, Math.max(0, strength) / 520);
const variation = 0.65 + pseudoRandom(x,y,101) * 0.7;
const blend = amount * variation;
const target = lum < 118 ? tone.shadow : tone.primary;

edited[dataIndex] = clamp(edited[dataIndex] * (1 - blend) + target[0] * blend);
edited[dataIndex + 1] = clamp(edited[dataIndex + 1] * (1 - blend) + target[1] * blend);
edited[dataIndex + 2] = clamp(edited[dataIndex + 2] * (1 - blend) + target[2] * blend);
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


function driftOffsets(x,y){
const choice = Math.floor(pseudoRandom(x,y,191) * 4);
if(choice === 0){
return [[1,0,0.34],[-1,1,0.22],[0,1,0.28],[1,1,0.16]];
}
if(choice === 1){
return [[-1,0,0.34],[1,1,0.22],[0,1,0.28],[-1,1,0.16]];
}
if(choice === 2){
return [[0,1,0.34],[1,0,0.22],[-1,1,0.28],[1,1,0.16]];
}
return [[1,1,0.34],[-1,0,0.22],[0,1,0.28],[1,0,0.16]];
}

function buildDriftOrder(width,height,seed){
const order = new Int32Array(width * height);
for(let i=0; i<order.length; i++){
order[i] = i;
}
for(let i=order.length - 1; i>0; i--){
const j = Math.floor(pseudoRandom(i,seed,313) * (i + 1));
const tmp = order[i];
order[i] = order[j];
order[j] = tmp;
}
return order;
}

function tonalLevelsForPalette(colorCount){
if(colorCount === 2){ return [0,255]; }
if(colorCount === 3){ return [0,128,255]; }
return [0,85,170,255];
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
lum = textureLuminance(lum,x,y,settings.textureType,settings.textureAmount);
if(settings.noise > 0){ lum += (pseudoRandom(x,y,77) - 0.5) * settings.noise; }
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

const edgeSource = new Float32Array(gray);
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
const newValue = levels[paletteIndex];
const error = adjusted - newValue;
counts[paletteIndex]++;
applyPaletteColor(edited,dataIndex,colors[paletteIndex]);
applyContaminationColor(edited,dataIndex,newValue,x,y,settings.textureType,settings.textureAmount);

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

if(settings.engine === "drift"){
const offsets = driftOffsets(x,y);
for(let i=0; i<offsets.length; i++){
addError(x + offsets[i][0],y + offsets[i][1],error,offsets[i][2]);
}
}
}

if(settings.engine === "drift"){
const order = buildDriftOrder(width,height,settings.threshold + settings.textureAmount + settings.noise);
for(let i=0; i<order.length; i++){
const idx = order[i];
const x = idx % width;
const y = Math.floor(idx / width);
processPixel(x,y);
}
} else {
for(let y=0; y<height; y++){
for(let x=0; x<width; x++){
processPixel(x,y);
}
}
}

if(settings.edgeCharacter === "dryplate"){
applyDryPlateEdges(edited,components,width,height,edgeSource,colors,settings.edgeStrength);
}

if(settings.edgeCharacter === "melt"){
applyMeltEdges(edited,components,width,height,edgeSource,colors,settings.edgeStrength);
}

return {counts};
};
}

function currentSettings(){
const palette = getPalette();
return {
engine: controls.engine.value,
paletteMode: controls.paletteMode.value,
palette: palette,
paletteName: palette.label,
threshold: Number(controls.threshold.value),
signalResponse: controls.signalResponse ? Number(controls.signalResponse.value) : 45,
diffusion: Number(controls.diffusion.value) / 100,
transmissionClarity: controls.transmissionClarity ? Number(controls.transmissionClarity.value) : 0,
textureType: controls.textureType.value,
textureAmount: Number(controls.textureAmount.value),
noise: Number(controls.noise.value),
edgeCharacter: controls.edgeCharacter ? controls.edgeCharacter.value : "clean",
edgeStrength: controls.edgeStrength ? Number(controls.edgeStrength.value) : 0
};
}

function countReport(report){
let parts = [];
for(let i=0; i<report.counts.length; i++){
parts.push("C" + (i + 1) + ": " + report.counts[i]);
}
return parts.join(" | ");
}

async function runVisualPreviewRender(){
if(!app || !core || !imaging || !batchPlay){ return; }
const settings = currentSettings();
let info = null;
await core.executeAsModal(async ()=>{
if(!previewSourceLayerID || !(await layerExists(previewSourceLayerID))){
await rememberPreviewSource();
}
const targetLayerID = await ensurePreviewLayer(settings);
info = await writePixelEffectFromSourceToTarget(previewSourceLayerID,targetLayerID,buildProcessor(settings));
await selectLayerByID(targetLayerID);
},{commandName:"Render SignalMirage Live Preview"});
if(info){
setStatus(
"Live visual preview rendered on temporary layer.\n" +
"Source: " + previewSourceLayerName + "\n" +
"Engine: " + settings.engine + "\n" +
"Mode: " + settings.paletteMode + " color\n" +
"Palette: " + settings.paletteName + "\n" +
"Threshold: " + settings.threshold + " | Signal Response: " + settings.signalResponse + " | Diffusion: " + Math.round(settings.diffusion * 100) + "\n" +
"Transmission Clarity: " + settings.transmissionClarity + "\n" +
"Contamination: " + settings.textureType + " / " + settings.textureAmount + " | Noise: " + settings.noise + "\n" +
"Edge: " + settings.edgeCharacter + " / " + settings.edgeStrength + "\n" +
countReport(info.report)
);
}
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
commandName: "SignalTone FX"
});
newImageData.dispose();
originalData.dispose();
return {width,height,report};
}

async function runEngine(){
const settings = currentSettings();
try{
let info = null;
setStatus("Working... duplicating selected layer and processing duplicate.");
if(!core) throw new Error("Photoshop core not available in browser.");
suppressPreview = true;
await core.executeAsModal(async ()=>{
if(previewLayerID){
await deleteLayerByID(previewLayerID);
previewLayerID = null;
}
if(previewSourceLayerID){
await selectLayerByID(previewSourceLayerID);
}
await duplicateActiveLayer("SignalMirage FINAL-V.1 - " + settings.engine + " - " + settings.paletteName);
info = await writePixelEffectToActiveLayer(buildProcessor(settings));
},{commandName:"Apply SignalMirage"});
suppressPreview = false;
if(livePreviewToggle && livePreviewToggle.checked){
livePreviewToggle.checked = false;
previewEnabled = false;
}
previewSourceLayerID = null;
setStatus(
"Applied SignalMirage to duplicate layer.\n" +
"Engine: " + settings.engine + "\n" +
"Mode: " + settings.paletteMode + " color\n" +
"Palette: " + settings.paletteName + "\n" +
"Threshold: " + settings.threshold + " | Signal Response: " + settings.signalResponse + " | Diffusion: " + Math.round(settings.diffusion * 100) + "\n" +
"Transmission Clarity: " + settings.transmissionClarity + "\n" +
"Contamination: " + settings.textureType + " / " + settings.textureAmount + " | Noise: " + settings.noise + "\n" +
"Edge: " + settings.edgeCharacter + " / " + settings.edgeStrength + "\n" +
countReport(info.report)
);
}catch(error){
suppressPreview = false;
console.error(error);
setStatus("Failed: " + stringifyError(error));
}
}

document.getElementById("applyEngine").onclick = runEngine;


// ====================================================
// FINAL-V.1 RELEASE NOTES
// ====================================================
// Final palette set:
// - Ghost + Dance
// - Pure Black + White
// - Midnight Moon
// - Smoke Signals
//
// Removed:
// - Desert Heat
// - Rust Canyon
//
// Renamed visible UI label:
// - Melt -> Toner Leak
//
// Note: the internal value/function name may remain "melt" for code stability.

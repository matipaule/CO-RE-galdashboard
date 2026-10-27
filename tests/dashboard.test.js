"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname,"..");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");

function cargar(fecha = "2026-10-09T15:00:00Z") {
  const elementos = new Map();
  const make = () => ({
    value:"", max:"", textContent:"", innerHTML:"", style:{}, dataset:{}, children:[], disabled:false,
    classList:{add(){},remove(){}}, addEventListener(){}, querySelector(){return null;},
    querySelectorAll(){return [];}, appendChild(el){this.children.push(el);}, focus(){}, scrollIntoView(){},
  });
  for (const m of html.matchAll(/id="([^"]+)"/g)) elementos.set(m[1],make());
  const el = id => { if(!elementos.has(id)) throw Error("ID inexistente: "+id); return elementos.get(id); };
  const alertas = [], textos = [], pdfs = [];
  let montoTipo = "total", modoAnticipo = "1", productos = [], productosManual = [];
  const filasProductos = lista => lista.map(p=>({querySelector:s=>({value:s===".producto-tipo" ? p.tipo : p.numero || ""})}));
  class Fecha extends Date { constructor(...args){ super(...(args.length ? args : [fecha])); } static now(){return new Date(fecha).getTime();} }
  const sandbox = {
    Date:Fecha, Intl, console, setTimeout:()=>0, clearTimeout(){},
    setInterval:()=>0, clearInterval(){}, alert:s=>alertas.push(s), confirm:()=>true,
    navigator:{clipboard:{writeText:s=>{textos.push(s);return Promise.resolve();}}},
    localStorage:{getItem:()=>"",setItem(){}},
    document:{getElementById:id=>elementos.get(id)||null,createElement:make,addEventListener(){},querySelectorAll:s=>
      s.includes("productosListManual") ? filasProductos(productosManual) : s.includes("producto-row") ? filasProductos(productos) : [],
      querySelector:s=>s.includes("montoTipo") ? {value:montoTipo} : s.includes("anticipoModo") ? {value:modoAnticipo} : null},
    window:{},
  };
  sandbox.window.jspdf = {jsPDF:function() {
    const textosDoc = [];
    const doc = {
      internal:{getNumberOfPages:()=>1},
      text(txt){textosDoc.push(...(Array.isArray(txt)?txt:[txt]));},
      splitTextToSize:txt=>[txt],
      save:nombre=>pdfs.push({nombre,texto:textosDoc.join("\n")}),
    };
    return new Proxy(doc,{get:(target,k)=>k in target ? target[k] : ()=>{}});
  }};
  vm.createContext(sandbox);
  const source = ["politicas.js","script.js"].map(f=>fs.readFileSync(path.join(root,f),"utf8")).join("\n");
  vm.runInContext(source+`
    globalThis.api = {calcularPropuestas,calcularInverso,calcularPlan,calcularAcuerdoDesdeFormulario,
      generarTextoWhatsApp,generarPDF,generarTextoManual,generarPdfManual,obtenerPlanManualGalicia,generarPDFDesdeSeleccion,
      crearTextoPropuestaGalicia,renderizarTablaEscenarios,toggleCeldaEscenario,copiarPropuestaCombinada,copiarWASeleccion,
      getVencimiento,formatARS,actualizarPreviewManual,actualizarModalidadManual,actualizarEstadoPolitica,parsearNumero,
      estado:()=>estadoActual, seleccion:_escSeleccion};
  `,sandbox);
  const valores = {
    inputNombre:"Prueba",inputDni:"12345678",inputDeuda:"6411073",inputPrimeraCuota:"2026-10-09",
    inputDescuento:"",inputVencimiento:"",inputMora:"",
    manualNombre:"Prueba",manualDni:"12345678",manualDeuda:"5000000",manualCapital:"3185011",
    manualCuotas:"6",manualModalidad:"quita",manualPrimeraCuota:"2026-10-09",manualVencimiento:"",
    manualMora:"",anticipoMonto:"500000",anticipoCuotas:"5",acuerdoMeses0:"24",
  };
  Object.entries(valores).forEach(([id,val])=>el(id).value=val);
  return {api:sandbox.api,el,alertas,textos,pdfs,window:sandbox.window,tipo:v=>montoTipo=v,modo:v=>modoAnticipo=v,
    productos:(lista,manual=false)=>{if(manual)productosManual=lista;else productos=lista;}};
}

test("el WhatsApp recupera íntegro el mensaje original, con productos y totales por cuenta",()=>{
  const {api,productos}=cargar();
  productos([{tipo:"Préstamo Personal",numero:"REF-PRUEBA"}]);
  api.calcularPropuestas();
  assert.equal(api.generarTextoWhatsApp(6),`🏦 BANCO GALICIA — Regularización de Deuda
📋 Mora Tardía · Extrajudicial
📆 Emisión: 09/10/2026 · Vence: mar, 13/10/2026

Estimado/a Prueba (DNI: 12345678),
Le acercamos la siguiente propuesta de pago para regularizar su deuda con Banco Galicia, gestionada por Estudio CO-RE. Sujeta a su confirmación.

📌 PROPUESTA DE PAGO: 6 PAGOS
🏷️ Descuento aplicado: 60%
💰 Monto total a regularizar: $ 3.185.022
📅 Valor de cada cuota: $ 530.837 x 6 meses

📦 Productos incluidos:
Préstamo Personal · REF-PRUEBA

🏧 DATOS DE PAGO — total $ 3.185.022, en 2 cuentas:
1) Capital → Banco Galicia · GALICIALEG · CBU 0070686120000002247308
Importe: $ 2.564.430 (6 de $ 427.405)
2) Honorarios 20%+IVA → Estudio CO-RE · GALICIAHONORARIOS · CBU 0070999030004062897261
Importe: $ 620.592 (6 de $ 103.432)
Cuentas a nombre de Maria Valeria Fandiño CUIT 27-20481581-5, facultada por Banco Galicia. Verifique en su sucursal.

⚠️ Válida 48 hs hábiles. Consultas: 0800-345-9707 · WhatsApp: 11-5897-7596`);
});

test("todas las salidas de texto incluyen productos, capital, honorarios y ambas cuentas",()=>{
  const f=cargar();
  f.productos([{tipo:"Préstamo Personal",numero:"REF-CALC"}]);
  f.productos([{tipo:"Tarjeta de Crédito Visa",numero:"REF-MANUAL"}],true);
  f.api.calcularPropuestas();
  const mensajes=[f.api.generarTextoWhatsApp(6)];
  f.api.copiarWASeleccion(60,6); mensajes.push(f.textos.at(-1));
  f.api.seleccion.set("85_1",{quita:85,cuotas:1}); f.api.seleccion.set("60_6",{quita:60,cuotas:6});
  f.api.copiarPropuestaCombinada(); mensajes.push(f.textos.at(-1));
  f.api.generarTextoManual(); mensajes.push(f.textos.at(-1));
  f.el("inputDeuda").value="12000000"; f.el("inputMora").value="630";
  f.api.calcularAcuerdoDesdeFormulario("acuerdo0","texto"); mensajes.push(f.textos.at(-1));
  f.el("inputDeuda").value="5000000"; f.el("inputMontoCliente").value="3185011";
  f.api.calcularInverso(); mensajes.push(f.api.generarTextoWhatsApp(6));
  for(const mensaje of mensajes) {
    for(const dato of ["Productos incluidos:","Capital → Banco Galicia","Honorarios 20%+IVA","Importe:","GALICIALEG","GALICIAHONORARIOS","0070686120000002247308","0070999030004062897261"]) assert.ok(mensaje.includes(dato),dato);
    assert.match(mensaje,/REF-(CALC|MANUAL)/);
  }
  assert.ok(mensajes[3].includes("REF-MANUAL")); assert.ok(!mensajes[3].includes("REF-CALC"));
});

test("dashboard normal, tabla y WhatsApp usan los nuevos topes y los mismos importes",()=>{
  const {api,el} = cargar();
  api.calcularPropuestas();
  assert.equal(api.estado().resultados[1].porcentaje,85);
  assert.equal(api.estado().resultados[3].porcentaje,80);
  assert.equal(api.estado().resultados[6].porcentaje,60);
  assert.match(el("monto6").textContent,/3\.185\.022/);
  const texto = api.generarTextoWhatsApp(6);
  assert.match(texto,/Valor de cada cuota: \$\s530\.837 x 6 meses/);
  assert.match(texto,/6 de \$\s427\.405/);
  assert.match(texto,/6 de \$\s103\.432/);
  assert.match(texto,/Importe: \$\s620\.592/);
  assert.equal(api.estado().resultados[6].pagos[0].banco+api.estado().resultados[6].pagos[0].honorarios,530837);
});

test("tabla habilita 7, 8 y 9 sólo sobre 20 millones, no con honorarios ni al igualar",()=>{
  const {api,el}=cargar();
  api.renderizarTablaEscenarios(20000000);
  assert.doesNotMatch(el("tablaEscenariosHead").innerHTML,/9 Pago/);
  api.renderizarTablaEscenarios(20000000.01);
  for(const c of [7,8,9]) assert.match(el("tablaEscenariosHead").innerHTML,new RegExp(c+" Pago"));
});

test("inversa recalcula total y cuota al subir ambas transferencias y sólo ofrece acciones dentro de pauta",()=>{
  const {api,el}=cargar();
  el("inputDeuda").value="5000000"; el("inputMontoCliente").value="3185011";
  api.calcularInverso();
  const p=api.estado().resultados[6];
  assert.equal(p.totalSinRedondeo,3185011);
  assert.equal(p.montoRecuperar,3185016);
  assert.equal(p.valorCuota,530836);
  assert.equal(p.ultimaCuota,530836);
  assert.match(api.generarTextoWhatsApp(6),/530\.836 x 6 meses/);
  el("inputMontoCliente").value="1";
  api.calcularInverso();
  assert.ok(el("gridInversoBody").children.slice(-6).every(tr=>!tr.innerHTML.includes("onclick")));
});

test("emisión manual muestra el total recalculado sin centavos en preview, WhatsApp y PDF",()=>{
  const {api,el,textos,pdfs,alertas}=cargar();
  api.actualizarPreviewManual();
  api.generarTextoManual(); api.generarPdfManual();
  assert.deepEqual(alertas,[]);
  assert.match(textos[0],/3\.185\.016/);
  assert.match(textos[0],/530\.836 x 6 meses/);
  assert.match(el("previewTotal").textContent,/3\.185\.016/);
  assert.match(el("manualValidMsg").textContent,/Total con redondeo/);
  assert.equal(pdfs.length,1);
  assert.match(pdfs[0].texto,/530\.836/);
  const plan=api.obtenerPlanManualGalicia();
  for(const p of plan.pagos) assert.equal(Math.round(p.banco*100)+Math.round(p.honorarios*100),Math.round(p.importe*100));
  assert.equal(plan.pagos.reduce((s,p)=>s+p.importe,0),3185016);
  for(const importe of Object.values(plan.pagos[0])) assert.equal(Number.isInteger(importe),true);
});

test("ni WhatsApp ni PDF permiten un centavo por debajo del máximo de quita",()=>{
  const {api,el,textos,pdfs,alertas}=cargar();
  el("manualDeuda").value="6411073"; el("manualCapital").value="3185021.06";
  api.actualizarPreviewManual(); api.generarTextoManual(); api.generarPdfManual();
  assert.equal(el("btnGenerarManual").disabled,true);
  assert.equal(el("btnTextoManual").disabled,true);
  assert.equal(textos.length,0); assert.equal(pdfs.length,0); assert.equal(alertas.length,2);
  el("manualCapital").value="3185021.07";
  api.generarTextoManual(); assert.equal(textos.length,1);
});

test("anticipo y seña cuentan como pago y recalculan el total con las transferencias enteras",()=>{
  for(const modo of ["1","2"]) {
    const {api,el,modo:setModo,textos,pdfs}=cargar();
    setModo(modo); el("anticipoCheck").checked=true;
    const p=api.obtenerPlanManualGalicia();
    assert.equal(p.cuotas,6);
    assert.equal(p.totalSinRedondeo,3185011);
    assert.equal(p.pagos.reduce((s,p)=>s+p.importe,0),3185016);
    assert.equal(p.montoRecuperar,3185016);
    assert.equal(p.anticipo.anticipo,500001);
    assert.equal(p.anticipo.saldo,2685015);
    api.generarTextoManual(); api.generarPdfManual();
    assert.equal(textos.length,1); assert.equal(pdfs.length,1);
    el("anticipoCuotas").value="6";
    api.generarTextoManual(); api.generarPdfManual();
    assert.equal(textos.length,1); assert.equal(pdfs.length,1);
  }
});

test("TNA 0 automático y manual verifica ambos umbrales y no permite interés extra",()=>{
  const {api,el,textos,pdfs}=cargar();
  el("inputDeuda").value="12000000"; el("inputMora").value="631";
  api.calcularAcuerdoDesdeFormulario("acuerdo0","texto");
  api.calcularAcuerdoDesdeFormulario("acuerdo0","pdf");
  assert.match(textos[0],/621\.000 x 24 meses/);
  assert.match(pdfs[0].texto,/TNA 0%/);
  el("inputMora").value="629"; api.calcularAcuerdoDesdeFormulario("acuerdo0","pdf");
  assert.equal(pdfs.length,1);
  el("manualModalidad").value="acuerdo0"; el("manualDeuda").value="12000000";
  el("manualMora").value="631"; el("manualCuotas").value="24"; el("manualCapital").value="14904000";
  api.generarPdfManual(); assert.equal(pdfs.length,2);
  el("manualCapital").value="14904001";
  api.generarPdfManual(); assert.equal(pdfs.length,2);
});

test("10 millones y 630 días habilitan TNA 0 en pantalla, WhatsApp y PDF automático y manual",()=>{
  const {api,el,textos,pdfs,alertas}=cargar();
  el("inputDeuda").value="10000000"; el("inputMora").value="630";
  api.actualizarEstadoPolitica();
  assert.match(el("acuerdoCeroEstado").textContent,/Cumple/);
  api.calcularAcuerdoDesdeFormulario("acuerdo0","texto");
  api.calcularAcuerdoDesdeFormulario("acuerdo0","pdf");
  assert.match(textos[0],/517\.501 x 24 meses/);
  assert.match(pdfs[0].texto,/517\.501/);
  el("manualModalidad").value="acuerdo0"; el("manualDeuda").value="10000000";
  el("manualMora").value="630"; el("manualCuotas").value="24"; el("manualCapital").value="12420000";
  api.actualizarPreviewManual(); api.generarTextoManual(); api.generarPdfManual();
  assert.equal(el("btnTextoManual").disabled,false);
  assert.equal(el("btnGenerarManual").disabled,false);
  assert.equal(textos.length,2); assert.equal(pdfs.length,2); assert.deepEqual(alertas,[]);
  assert.match(textos[1],/517\.501 x 24 meses/);
  for(const [deuda,mora] of [["9999999.99","630"],["10000000","629"]]) {
    el("inputDeuda").value=deuda; el("inputMora").value=mora;
    api.actualizarEstadoPolitica();
    assert.match(el("acuerdoCeroEstado").textContent,/desde \$10 millones/);
    api.calcularAcuerdoDesdeFormulario("acuerdo0","texto"); api.calcularAcuerdoDesdeFormulario("acuerdo0","pdf");
    el("manualDeuda").value=deuda; el("manualMora").value=mora;
    api.actualizarPreviewManual(); api.generarTextoManual(); api.generarPdfManual();
    assert.equal(el("btnTextoManual").disabled,true); assert.equal(el("btnGenerarManual").disabled,true);
  }
  assert.equal(textos.length,2); assert.equal(pdfs.length,2);
});

test("TNA 20 y 36 meses desaparecen de la UI y no se pueden exportar con valores antiguos",()=>{
  const {api,el,textos,pdfs,alertas}=cargar();
  assert.doesNotMatch(html,/acuerdo20|acuerdoMeses20|acuerdoTotal20|TNA 20%|36 meses/);
  assert.doesNotThrow(()=>api.calcularAcuerdoDesdeFormulario("acuerdo20","texto"));
  assert.doesNotThrow(()=>api.calcularAcuerdoDesdeFormulario("acuerdo20","pdf"));
  el("manualModalidad").value="acuerdo20"; el("manualCuotas").value="24";
  api.actualizarPreviewManual(); api.generarTextoManual(); api.generarPdfManual();
  assert.equal(el("btnTextoManual").disabled,true); assert.equal(el("btnGenerarManual").disabled,true);
  el("manualModalidad").value="acuerdo0"; el("manualDeuda").value="10000000";
  el("manualMora").value="630"; el("manualCapital").value="12420000";
  for(const cuotas of [25,36]) {
    el("manualCuotas").value=String(cuotas);
    el("acuerdoMeses0").value=String(cuotas);
    api.generarTextoManual(); api.generarPdfManual();
    api.calcularAcuerdoDesdeFormulario("acuerdo0","texto"); api.calcularAcuerdoDesdeFormulario("acuerdo0","pdf");
  }
  assert.equal(textos.length,0); assert.equal(pdfs.length,0);
  assert.match(alertas.join(" "),/inválida/);
});

test("fecha de octubre y cambios de deuda se verifican de nuevo al exportar",()=>{
  const {api,el,pdfs,alertas}=cargar();
  api.calcularPropuestas();
  el("inputPrimeraCuota").value="2026-11-01";
  assert.equal(api.generarTextoWhatsApp(3),"");
  assert.notEqual(api.generarTextoWhatsApp(6),"");
  el("inputPrimeraCuota").value="2026-10-09"; el("inputDeuda").value="7000000";
  api.generarPDF(6); assert.equal(pdfs.length,0);
  assert.match(alertas.at(-1),/cambió/);
});

test("primera fecha en noviembre habilita cancelatorio al 70 y explica los plazos en la tabla",()=>{
  const {api,el,textos,pdfs}=cargar("2026-10-23T15:00:00Z");
  el("inputDeuda").value="1000000"; el("inputPrimeraCuota").value="2026-11-05";
  api.renderizarTablaEscenarios(1000000);
  const filas=el("tablaEscenariosBody").children;
  assert.match(filas.find(tr=>tr.dataset.quita===70).children[1].textContent,/372\.600/);
  assert.equal(filas.find(tr=>tr.dataset.quita===75).children[1].textContent,"—");
  assert.match(el("tablaEscenariosPolitica").textContent,/1 pago.*70%/);
  assert.match(el("tablaEscenariosPolitica").textContent,/2 y 3.*octubre/);
  api.calcularPropuestas();
  assert.equal(api.estado().resultados[1].porcentaje,70);
  assert.match(api.generarTextoWhatsApp(1),/70%/);
  api.copiarWASeleccion(70,1); api.generarPDFDesdeSeleccion(70,1);
  assert.equal(textos.length,1); assert.equal(pdfs.length,1);
  api.copiarWASeleccion(75,1); api.generarPDFDesdeSeleccion(75,1);
  assert.equal(textos.length,1); assert.equal(pdfs.length,1);
});

test("en noviembre cancelatorio funciona en automático, inversa y manual con vencimiento vigente",()=>{
  const f=cargar("2026-11-02T15:00:00Z");
  for(const prefijo of ["input","manual"]) {
    f.el(prefijo+"Deuda").value="1000000";
    f.el(prefijo+"PrimeraCuota").value="2026-11-05";
  }
  f.api.actualizarEstadoPolitica();
  assert.match(f.el("politicaEstado").textContent,/cancelatori.*70%/i);
  f.api.calcularPropuestas();
  const texto=f.api.generarTextoWhatsApp(1);
  assert.match(texto,/70%/); assert.match(texto,/Vence: mié, 04\/11\/2026/);
  f.api.generarPDF(1); assert.equal(f.pdfs.length,1);
  assert.match(f.pdfs[0].texto,/04\/11\/2026/);
  f.el("inputMontoCliente").value="372600"; f.api.calcularInverso();
  assert.notEqual(f.api.generarTextoWhatsApp(1),"");
  f.el("manualCuotas").value="1"; f.el("manualCapital").value="372600";
  f.api.actualizarPreviewManual();
  assert.match(f.el("manualDescHint").textContent,/Máx\. 70%/);
  assert.equal(f.el("manualVencimiento").max,"");
  f.api.generarTextoManual(); f.api.generarPdfManual();
  assert.match(f.textos.at(-1),/04\/11\/2026/);
  assert.equal(f.pdfs.length,2); assert.deepEqual(f.alertas,[]);
  f.el("manualCapital").value="310500";
  f.api.actualizarPreviewManual(); f.api.generarTextoManual(); f.api.generarPdfManual();
  assert.equal(f.el("btnTextoManual").disabled,true); assert.equal(f.pdfs.length,2);
});

test("modalidad Cancelación del repositorio emite un pago único aunque queden cuotas y anticipo previos",()=>{
  const {api,el,textos,pdfs,alertas}=cargar();
  el("manualModalidad").value="cancelacion";
  el("anticipoCheck").checked=true;
  api.actualizarModalidadManual();
  const plan=api.obtenerPlanManualGalicia();
  assert.equal(plan.cuotas,1); assert.equal(plan.modalidad,"quita");
  assert.equal(plan.cancelacion,true); assert.equal(plan.anticipo,undefined);
  assert.equal(el("grpManualCuotas").style.display,"none");
  assert.match(html,/<option value="cancelacion">Cancelación · pago único<\/option>/);
  api.generarTextoManual(); api.generarPdfManual();
  assert.deepEqual(alertas,[]); assert.equal(textos.length,1); assert.equal(pdfs.length,1);
  assert.match(textos[0],/CANCELACIÓN \(PAGO ÚNICO\)/);
  assert.match(textos[0],/Pago cancelatorio \(único\)/);
  assert.match(pdfs[0].texto,/CANCELACION TOTAL - PAGO UNICO/);
  assert.match(pdfs[0].texto,/Cancelacion - fecha de pago: 09\/10\/2026/);
  assert.doesNotMatch(pdfs[0].texto,/PLAN DE PAGO EN|PLAN DE PAGO CON/);
  el("manualModalidad").value="quita"; el("anticipoCheck").checked=false;
  api.actualizarModalidadManual();
  assert.equal(el("grpManualCuotas").style.display,"");
  assert.equal(api.obtenerPlanManualGalicia().cuotas,6);
});

test("modalidad Cancelación conserva el tope de noviembre y vencimiento en WhatsApp y PDF",()=>{
  const {api,el,textos,pdfs}=cargar("2026-11-02T15:00:00Z");
  el("manualModalidad").value="cancelacion"; el("manualDeuda").value="1000000";
  el("manualCapital").value="372600"; el("manualPrimeraCuota").value="2026-11-05";
  api.actualizarModalidadManual();
  assert.equal(el("btnTextoManual").disabled,false);
  assert.match(el("manualDescHint").textContent,/Máx\. 70%/);
  assert.equal(el("manualVencimiento").max,"");
  api.generarTextoManual(); api.generarPdfManual();
  assert.equal(textos.length,1); assert.equal(pdfs.length,1);
  assert.match(textos[0],/CANCELACIÓN \(PAGO ÚNICO\)/);
  assert.match(textos[0],/04\/11\/2026/); assert.match(pdfs[0].texto,/04\/11\/2026/);
  el("manualCapital").value="310500";
  api.actualizarPreviewManual(); api.generarTextoManual(); api.generarPdfManual();
  assert.equal(el("btnGenerarManual").disabled,true);
  assert.equal(textos.length,1); assert.equal(pdfs.length,1);
});

test("cancelación manual: vencimiento de noviembre con pago de octubre se explica y pago de noviembre emite al 70",()=>{
  const {api,el,textos,pdfs,alertas}=cargar("2026-10-27T15:00:00Z");
  el("manualModalidad").value="cancelacion"; el("manualDeuda").value="1000000";
  el("manualCapital").value="372600"; el("manualPrimeraCuota").value="2026-10-27";
  el("manualVencimiento").value="2026-11-03";
  api.actualizarModalidadManual();
  assert.equal(el("manualVencimiento").max,"");
  assert.equal(el("btnGenerarManual").disabled,true);
  assert.match(el("manualValidMsg").textContent,/«Fecha de pago cancelatorio» a noviembre.*70%/);
  assert.equal(el("manualPrimeraCuota").value,"2026-10-27"); assert.equal(el("manualCapital").value,"372600");
  api.generarPdfManual(); assert.equal(pdfs.length,0);
  assert.match(alertas.at(-1),/«Fecha de pago cancelatorio» a noviembre/);
  el("manualPrimeraCuota").value="2026-11-05"; api.actualizarPreviewManual();
  assert.equal(el("btnGenerarManual").disabled,false);
  assert.match(el("manualDescHint").textContent,/Máx\. 70%/);
  api.generarTextoManual(); api.generarPdfManual();
  assert.equal(textos.length,1); assert.equal(pdfs.length,1);
  assert.match(textos[0],/CANCELACIÓN \(PAGO ÚNICO\)/); assert.match(textos[0],/03\/11\/2026/);
  assert.match(pdfs[0].texto,/CANCELACION TOTAL - PAGO UNICO/); assert.match(pdfs[0].texto,/372\.600/);
  assert.match(pdfs[0].texto,/05\/11\/2026/); assert.match(pdfs[0].texto,/03\/11\/2026/);
  // 75% y 85% siguen bloqueados con pago en noviembre, y 85% con vencimiento fuera de octubre.
  for (const [pago,capital] of [["2026-11-05","310500"],["2026-11-05","186300"],["2026-10-27","186300"]]) {
    el("manualPrimeraCuota").value=pago; el("manualCapital").value=capital; api.actualizarPreviewManual();
    assert.equal(el("btnGenerarManual").disabled,true);
    api.generarTextoManual(); api.generarPdfManual();
    assert.equal(textos.length,1); assert.equal(pdfs.length,1);
  }
  // Financiación: no se extiende a noviembre ni por pago ni por vencimiento.
  el("manualModalidad").value="quita"; el("manualCuotas").value="2"; el("manualCapital").value="248400";
  for (const [pago,venc] of [["2026-11-05","2026-11-03"],["2026-10-27","2026-11-03"]]) {
    el("manualPrimeraCuota").value=pago; el("manualVencimiento").value=venc; api.actualizarModalidadManual();
    assert.equal(el("btnGenerarManual").disabled,true);
    assert.doesNotMatch(el("manualValidMsg").textContent,/Fecha de pago cancelatorio/);
    api.generarTextoManual(); api.generarPdfManual();
    assert.equal(textos.length,1); assert.equal(pdfs.length,1);
  }
});

test("campaña expirada bloquea normal, combinado, manual y acuerdos",()=>{
  const {api,el,textos,pdfs}=cargar("2026-11-01T15:00:00Z");
  el("inputPrimeraCuota").value="2026-11-01"; el("manualPrimeraCuota").value="2026-11-01";
  api.calcularPropuestas(); assert.equal(api.generarTextoWhatsApp(6),""); api.generarPDF(6);
  api.seleccion.set("60_6",{quita:60,cuotas:6}); api.copiarPropuestaCombinada();
  api.generarTextoManual(); api.generarPdfManual();
  el("inputDeuda").value="10000000"; el("inputMora").value="630";
  api.calcularAcuerdoDesdeFormulario("acuerdo0","pdf");
  assert.equal(textos.length,0); assert.equal(pdfs.length,0);
});

test("combinado mantiene los mismos totales y cuotas que cada alternativa",()=>{
  const {api,textos}=cargar();
  api.toggleCeldaEscenario(85,1,0,0); api.toggleCeldaEscenario(60,6,0,0);
  api.copiarPropuestaCombinada();
  assert.match(textos[0],/Monto total a regularizar: \$\s1\.194\.384/);
  assert.match(textos[0],/Monto total a regularizar: \$\s3\.185\.022/);
  assert.match(textos[0],/530\.837 x 6 meses/);
  assert.equal(textos[0].match(/Productos incluidos:/g).length,2);
  assert.equal(textos[0].match(/Honorarios 20%\+IVA/g).length,2);
});

test("vencimiento automático no sobrepasa 31 de octubre",()=>{
  const {api}=cargar("2026-10-30T15:00:00Z");
  assert.equal(api.getVencimiento(),"31/10/2026");
});

test("importes argentinos, decimales y entradas ambiguas se interpretan con seguridad",()=>{
  const {api}=cargar();
  for(const [texto,n] of [["20.000.000",20000000],["20.000.000,01",20000000.01],["6411073.25",6411073.25],["10000000,01",10000000.01],["$ 1.250.000,50",1250000.50]]) {
    assert.equal(api.parsearNumero(texto),n);
  }
  for(const texto of ["150,000","5abc","1.23.456","1,2345","Infinity","1e6"]) {
    assert.equal(Number.isNaN(api.parsearNumero(texto)),true);
  }
});

test("PDF de una alternativa no cambia las demás propuestas ni su quita",()=>{
  const {api,pdfs}=cargar();
  api.calcularPropuestas();
  const anterior=api.generarTextoWhatsApp(1);
  api.generarPDF(6); api.generarPDFDesdeSeleccion(70,1);
  assert.equal(pdfs.length,2);
  assert.equal(api.generarTextoWhatsApp(1),anterior);
  assert.match(api.generarTextoWhatsApp(3),/80%/);
});

test("inversa bloquea una propuesta anterior si cambia monto o modalidad",()=>{
  const {api,el,tipo,pdfs}=cargar();
  el("inputMontoCliente").value="3185022"; api.calcularInverso();
  el("inputMontoCliente").value="3000000"; api.generarPDF(6);
  assert.equal(pdfs.length,0);
  el("inputMontoCliente").value="3185022"; tipo("cuota"); api.generarPDF(6);
  assert.equal(pdfs.length,0);
});

test("el redondeo no habilita anunciar una quita sobre el tope para saldos mínimos",()=>{
  const {api,el}=cargar();
  el("inputDeuda").value="1"; api.renderizarTablaEscenarios(1);
  const fila85=el("tablaEscenariosBody").children[0];
  assert.equal(fila85.children[2].textContent,"—");
});

test("totales mínimos y más de dos decimales no provocan errores de interfaz",()=>{
  const {api,el}=cargar();
  el("inputMontoCliente").value="0,01";
  assert.doesNotThrow(()=>api.calcularInverso());
  assert.ok(el("gridInversoBody").children.every(tr=>!tr.innerHTML.includes("onclick")));
  el("manualDeuda").value="5000000.001";
  assert.doesNotThrow(()=>api.actualizarPreviewManual());
  assert.equal(el("btnGenerarManual").disabled,true);
  assert.equal(el("btnTextoManual").disabled,true);
});

test("el caso de la captura es entero y consistente en tarjeta, WhatsApp y PDF",()=>{
  const {api,el,textos,pdfs}=cargar();
  el("inputDeuda").value="7934642";
  api.calcularPropuestas();
  assert.match(el("monto1").textContent,/1\.478\.225/);
  assert.match(el("capitalBancoCard1").textContent,/1\.190\.197/);
  assert.match(el("honAgenCard1").textContent,/288\.028/);
  api.copiarWASeleccion(85,1); api.generarPDF(1);
  for(const texto of [textos[0],pdfs[0].texto]) {
    for(const dato of ["1.478.225","1.190.197","288.028"]) assert.ok(texto.includes(dato),dato);
    assert.doesNotMatch(texto,/\$\s*[\d.]+,\d+/);
  }
  assert.equal(api.formatARS(1520.98),"$ 1.521");
  assert.equal(api.formatARS(1521),"$ 1.521");
  assert.equal(api.formatARS(0),"$ 0");
});

test("se bloquea exportar si alguna cuota, transferencia o total dejó de coincidir",()=>{
  for(const campo of ["montoRecuperar","valorCuota","ultimaCuota","capitalBanco","honorariosAgencia"]) {
    const {api,pdfs}=cargar(); api.calcularPropuestas(); api.estado().resultados[6][campo]++;
    assert.equal(api.generarTextoWhatsApp(6),""); api.generarPDF(6); assert.equal(pdfs.length,0);
  }
  const {api,pdfs}=cargar(); api.calcularPropuestas(); api.estado().resultados[6].pagos[0].banco++;
  assert.equal(api.generarTextoWhatsApp(6),""); api.generarPDF(6); assert.equal(pdfs.length,0);
});

test("la validez del mensaje respeta vencimiento manual y tope de campaña",()=>{
  const f=cargar(); f.api.calcularPropuestas(); f.el("inputVencimiento").value="2026-10-10";
  const texto=f.api.generarTextoWhatsApp(6);
  assert.match(texto,/Vence: sáb, 10\/10\/2026/);
  assert.match(texto,/Válida hasta la fecha indicada/); assert.doesNotMatch(texto,/48 hs/);
  const fin=cargar("2026-10-30T15:00:00Z"); fin.el("inputPrimeraCuota").value="2026-10-30";
  fin.api.calcularPropuestas(); const cierre=fin.api.generarTextoWhatsApp(6);
  assert.match(cierre,/Vence: sáb, 31\/10\/2026/); assert.doesNotMatch(cierre,/48 hs/);
});

module.exports = {cargar};

test("el PDF identifica contado, cuotas, anticipo, seña y acuerdo TNA 0",()=>{
  const contado=cargar(); contado.api.calcularPropuestas(); contado.api.generarPDF(1);
  assert.match(contado.pdfs[0].texto,/PAGO CANCELATORIO DE CONTADO/);
  assert.doesNotMatch(contado.pdfs[0].texto,/PLAN DE PAGO EN \d+ CUOTAS/);

  const cuotas=cargar(); cuotas.api.calcularPropuestas(); cuotas.api.generarPDF(6);
  assert.match(cuotas.pdfs[0].texto,/PLAN DE PAGO EN 6 CUOTAS MENSUALES/);
  assert.doesNotMatch(cuotas.pdfs[0].texto,/PAGO CANCELATORIO/);

  for(const [modo,etiqueta] of [["1","ANTICIPO"],["2","SENA"]]) {
    const manual=cargar(); manual.el("anticipoCheck").checked=true; manual.modo(modo);
    manual.api.generarPdfManual();
    assert.match(manual.pdfs[0].texto,new RegExp("PLAN DE PAGO CON "+etiqueta+" \\+ 5 CUOTAS MENSUALES"));
    assert.doesNotMatch(manual.pdfs[0].texto,/PAGO CANCELATORIO/);
  }

  const cero=cargar(); cero.el("inputDeuda").value="10000000"; cero.el("inputMora").value="630";
  cero.api.calcularAcuerdoDesdeFormulario("acuerdo0","pdf");
  assert.match(cero.pdfs[0].texto,/PLAN DE PAGO EN 24 CUOTAS MENSUALES/);
  assert.match(cero.pdfs[0].texto,/TNA 0%/);
});

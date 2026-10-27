"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "script.js");
const source = `${fs.readFileSync(path.join(__dirname, "..", "politicas.js"), "utf8")}
${fs.readFileSync(scriptPath, "utf8")}
globalThis.__test = { calcularPlan, formatARS };`;

const context = {
  console,
  Intl,
  Math,
  Number,
  Date,
  Map,
  Set,
  setTimeout,
  clearTimeout,
  document: { addEventListener() {} },
  window: {},
  navigator: {},
  localStorage: { getItem() { return null; } },
};

vm.createContext(context);
vm.runInContext(source, context);

const { calcularPlan, formatARS } = context.__test;

function enteroMostrado(importe) {
  return Number(formatARS(importe).replace(/\D/g, ""));
}

// Caso reportado: seis pagos con la quita máxima del 60 %.
const deuda = 6_858_384;
const cuotas = 6;
const descuento = 0.60;
const plan = calcularPlan(deuda, cuotas, descuento);

assert.equal(plan.totalSinRedondeo, 3_407_250);
assert.equal(enteroMostrado(plan.valorCuota), 567_876);
assert.equal(enteroMostrado(plan.montoRecuperar), 3_407_256);
assert.equal(plan.pagos[0].banco,457227);
assert.equal(plan.pagos[0].honorarios,110649);
assert.equal(plan.montoRecuperar, plan.valorCuota * cuotas);

// Redondear nunca debe llevar el total por debajo del mínimo de la pauta.
const minimoPauta = deuda * 1.242 * (1 - descuento);
assert.ok(plan.montoRecuperar >= minimoPauta);
assert.ok(plan.totalSinRedondeo - minimoPauta < cuotas);
assert.ok(plan.montoRecuperar - plan.totalSinRedondeo < 2*cuotas);

console.log("OK: tabla, propuesta y total usan el mismo redondeo seguro");

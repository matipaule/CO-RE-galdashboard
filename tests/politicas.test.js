"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function cargar() {
  const context = { Intl, Date, Math, Number, BigInt, Map, Set };
  vm.createContext(context);
  const archivo = path.join(__dirname, "..", "politicas.js");
  vm.runInContext(fs.readFileSync(archivo, "utf8") + `
    globalThis.api = {
      POLITICA_GALICIA, limiteQuitaGalicia, cuotasDisponiblesGalicia,
      validarPropuestaGalicia, calcularPlanGalicia, crearPlanFijoGalicia,
      calcularAcuerdoGalicia, aCentavos, repartirPagoGalicia, redondearPesoGalicia
    };`, context);
  return context.api;
}

const contexto = { fecha: "2026-10-09", primeraCuota: "2026-10-12", moraDias: 631 };

test("topes 85/80/60 y nueve pagos solo con deuda mayor a 20 millones", () => {
  const a = cargar();
  assert.equal(a.limiteQuitaGalicia(1, 100000), .85);
  assert.equal(a.limiteQuitaGalicia(2, 100000), .80);
  assert.equal(a.limiteQuitaGalicia(3, 100000), .80);
  assert.equal(a.limiteQuitaGalicia(6, 100000), .60);
  assert.equal(a.limiteQuitaGalicia(9, 20000000), null);
  assert.equal(a.limiteQuitaGalicia(9, 20000000.01), .60);
  assert.equal(a.cuotasDisponiblesGalicia(20000000).includes(9), false);
  assert.equal(a.cuotasDisponiblesGalicia(20000000.01).includes(7), true);
});

test("vigencia y primera cuota dentro de campaña se verifican al emitir", () => {
  const a = cargar();
  const p = { deuda: 5000000, cuotas: 3, total: 1242000, ...contexto };
  assert.deepEqual(Array.from(a.validarPropuestaGalicia(p)), []);
  assert.ok(a.validarPropuestaGalicia({ ...p, fecha: "2026-10-06" }).length);
  assert.ok(a.validarPropuestaGalicia({ ...p, fecha: "2027-01-01", primeraCuota: "2027-01-01" }).length);
  assert.ok(a.validarPropuestaGalicia({ ...p, primeraCuota: "2027-01-01" }).length);
  assert.ok(a.validarPropuestaGalicia({ ...p, primeraCuota: "2026-10-08" }).length);
  assert.ok(a.validarPropuestaGalicia({ ...p, total: p.total - .01 }).length);
});

test("prórroga: noviembre y diciembre habilitan 85/80/60, 9 pagos y TNA 0 hasta el 31/12 inclusive", () => {
  const a = cargar();
  const propuesta = (cuotas, quita, fecha, primeraCuota, deuda = 1000000) => {
    const p = a.calcularPlanGalicia(deuda, cuotas, quita);
    return { deuda, cuotas, total: p.montoRecuperar, totalSinRedondeo: p.totalSinRedondeo,
      quitaSolicitada: quita, fecha, primeraCuota, vencimiento: "2026-12-31" };
  };
  assert.equal(a.POLITICA_GALICIA.desde, "2026-10-07");
  assert.equal(a.POLITICA_GALICIA.hasta, "2026-12-31");
  for (const [fecha, primeraCuota] of [["2026-10-29", "2026-12-31"], ["2026-11-02", "2026-11-05"],
    ["2026-12-01", "2026-12-15"], ["2026-12-31", "2026-12-31"]]) {
    for (const [cuotas, quita] of [[1, .85], [2, .80], [3, .80], [4, .60], [5, .60], [6, .60]]) {
      assert.deepEqual(Array.from(a.validarPropuestaGalicia(propuesta(cuotas, quita, fecha, primeraCuota))), [], `${cuotas} pagos ${fecha}`);
      assert.ok(a.validarPropuestaGalicia(propuesta(cuotas, quita + .01, fecha, primeraCuota)).length, `${cuotas} pagos sobre tope ${fecha}`);
    }
    for (const cuotas of [7, 8, 9]) {
      assert.deepEqual(Array.from(a.validarPropuestaGalicia(propuesta(cuotas, .60, fecha, primeraCuota, 20000000.01))), []);
      assert.ok(a.validarPropuestaGalicia(propuesta(cuotas, .60, fecha, primeraCuota, 20000000)).length);
    }
    const cero = a.calcularAcuerdoGalicia(10000000, 24, 0);
    const acuerdo = { deuda: 10000000, cuotas: 24, total: cero.montoRecuperar, totalSinRedondeo: cero.totalSinRedondeo,
      modalidad: "acuerdo0", moraDias: 630, fecha, primeraCuota, vencimiento: "2026-12-31" };
    assert.deepEqual(Array.from(a.validarPropuestaGalicia(acuerdo)), []);
    assert.ok(a.validarPropuestaGalicia({ ...acuerdo, moraDias: 629 }).length);
    assert.match(a.validarPropuestaGalicia({ ...acuerdo, vencimiento: "2027-01-01" }).join(" "), /31\/12\/2026/);
  }
  // 4 a 6 pagos conservan la lógica previa de primer pago: puede caer después del fin.
  assert.deepEqual(Array.from(a.validarPropuestaGalicia(propuesta(6, .60, "2026-12-28", "2027-01-05"))), []);
  // Desde el 01/01/2027 la campaña no rige: sin cuotas ni TNA 0.
  for (const [cuotas, quita] of [[2, .80], [3, .80], [4, .60], [6, .60]]) {
    assert.match(a.validarPropuestaGalicia(propuesta(cuotas, quita, "2027-01-01", "2027-01-04")).join(" "), /31\/12\/2026/);
  }
  const cero = a.calcularAcuerdoGalicia(10000000, 24, 0);
  assert.ok(a.validarPropuestaGalicia({ deuda: 10000000, cuotas: 24, total: cero.montoRecuperar, modalidad: "acuerdo0",
    moraDias: 630, fecha: "2027-01-01", primeraCuota: "2027-01-04" }).length);
  // 2 y 3 pagos con primera cuota en enero quedan bloqueados aun emitiendo en diciembre.
  for (const cuotas of [2, 3]) {
    for (const quita of [.80, .70, .60]) {
      assert.match(a.validarPropuestaGalicia(propuesta(cuotas, quita, "2026-12-28", "2027-01-04")).join(" "), /primera cuota.*31\/12\/2026/);
    }
  }
  assert.ok(a.validarPropuestaGalicia(propuesta(1, .85, "2026-10-06", "2026-10-06")).length);
});

test("cancelatorio fuera de campaña permite hasta 70% con pago desde enero de 2027", () => {
  const a = cargar();
  for (const fecha of ["2026-10-23", "2026-12-28", "2027-01-04"]) {
    for (const quita of [.70, .60, 0]) {
      const plan = a.calcularPlanGalicia(1000000, 1, quita);
      const errores = a.validarPropuestaGalicia({ deuda: 1000000, cuotas: 1,
        total: plan.montoRecuperar, totalSinRedondeo: plan.totalSinRedondeo,
        quitaSolicitada: quita, fecha, primeraCuota: "2027-01-05", vencimiento: "2027-01-04" });
      assert.deepEqual(Array.from(errores), []);
    }
    for (const quita of [.7001, .75, .80, .85]) {
      const plan = a.calcularPlanGalicia(1000000, 1, quita);
      assert.ok(a.validarPropuestaGalicia({ deuda: 1000000, cuotas: 1,
        total: plan.montoRecuperar, totalSinRedondeo: plan.totalSinRedondeo,
        quitaSolicitada: quita, fecha, primeraCuota: "2027-01-05" }).length);
    }
  }
});

test("la excepción cancelatoria conserva la campaña y no autoriza cuotas nuevas", () => {
  const a = cargar();
  const propuesta = (cuotas, quita, fecha, primeraCuota) => {
    const p = a.calcularPlanGalicia(1000000, cuotas, quita);
    return { deuda: 1000000, cuotas, total: p.montoRecuperar, totalSinRedondeo: p.totalSinRedondeo,
      quitaSolicitada: quita, fecha, primeraCuota };
  };
  assert.deepEqual(Array.from(a.validarPropuestaGalicia(propuesta(1, .85, "2026-12-23", "2026-12-31"))), []);
  for (const cuotas of [2, 3]) {
    assert.match(a.validarPropuestaGalicia(propuesta(cuotas, .70, "2026-12-23", "2027-01-05")).join(" "), /primera cuota.*31\/12\/2026/);
  }
  for (const cuotas of [4, 5, 6]) {
    assert.deepEqual(Array.from(a.validarPropuestaGalicia(propuesta(cuotas, .60, "2026-12-23", "2027-01-05"))), []);
    assert.ok(a.validarPropuestaGalicia(propuesta(cuotas, .70, "2026-12-23", "2027-01-05")).length);
    assert.ok(a.validarPropuestaGalicia(propuesta(cuotas, .60, "2027-01-04", "2027-01-05")).length);
  }
  const cancelatorio = propuesta(1, .70, "2027-01-04", "2027-01-05");
  for (const primeraCuota of ["", "2027-01-03", "2027-01-32"]) {
    assert.ok(a.validarPropuestaGalicia({ ...cancelatorio, primeraCuota }).length);
  }
  assert.ok(a.validarPropuestaGalicia({ ...cancelatorio, vencimiento: "2027-01-03" }).length);
  assert.deepEqual(Array.from(a.validarPropuestaGalicia({ ...cancelatorio, vencimiento: "2027-02-15" })), []);
});

test("24 meses TNA 0 incluye exactamente 10 millones y 630 días, sin planes TNA 20", () => {
  const a = cargar();
  const p = { deuda: 10000000, cuotas: 24, total: 12420000, modalidad: "acuerdo0", ...contexto, moraDias: 630 };
  assert.deepEqual(Array.from(a.validarPropuestaGalicia(p)), []);
  for (const [deuda, moraDias] of [[10000000,631],[10000000.01,630],[12000000,631]]) {
    const acuerdo = a.calcularAcuerdoGalicia(deuda,24,0);
    assert.deepEqual(Array.from(a.validarPropuestaGalicia({ ...p, deuda, moraDias, total: acuerdo.montoRecuperar, totalSinRedondeo: acuerdo.totalSinRedondeo })), []);
  }
  const bajo = a.calcularAcuerdoGalicia(9999999.99,24,0);
  assert.match(a.validarPropuestaGalicia({ ...p, deuda: 9999999.99, total: bajo.montoRecuperar }).join(" "), /al menos/);
  for (const moraDias of [629,629.99,630.01,null]) assert.ok(a.validarPropuestaGalicia({ ...p, moraDias }).length);
  assert.ok(a.validarPropuestaGalicia({ ...p, cuotas: 25 }).length);
  const acuerdo = a.calcularAcuerdoGalicia(12000000, 24, 0);
  assert.equal(acuerdo.tna, 0);
  assert.equal(acuerdo.montoRecuperar, 14904000);
  assert.equal(acuerdo.valorCuota, 621000);
  for (const cuotas of [24,36]) assert.match(a.validarPropuestaGalicia({ ...p, modalidad: "acuerdo20", cuotas }).join(" "), /inválida/);
  assert.throws(() => a.calcularAcuerdoGalicia(10000000,24,.20), /TNA no permitida/);
  assert.throws(() => a.calcularAcuerdoGalicia(10000000,36,0), /1 a 24/);
});

test("los enteros exactos no suben por ruido binario; ambas cuentas sí suben si tienen centavos", () => {
  const a = cargar();
  assert.equal(a.calcularPlanGalicia(1250000, 1, .7).montoRecuperar, 465750);
  assert.equal(a.calcularPlanGalicia(1250000, 1, .85).montoRecuperar, 232875);
  const p = a.calcularPlanGalicia(6858384, 6, .6);
  assert.equal(p.totalSinRedondeo, 3407250);
  assert.equal(p.valorCuota, 567876);
  assert.equal(p.montoRecuperar, 3407256);
  assert.equal(p.pagos[0].banco,457227);
  assert.equal(p.pagos[0].honorarios,110649);
  assert.equal(a.redondearPesoGalicia(1520.98),1521);
  assert.equal(a.redondearPesoGalicia(1521),1521);
  assert.equal(Object.is(a.redondearPesoGalicia(0),-0),false);
  const captura = a.calcularPlanGalicia(7934642,1,.85);
  assert.equal(captura.pagos[0].banco,1190197);
  assert.equal(captura.pagos[0].honorarios,288028);
  assert.equal(captura.valorCuota,1478225);
});

test("planes manuales suben ambas cuentas a pesos enteros y recalculan total y cuotas", () => {
  const a = cargar();
  for (const total of [3185011, 3185001, 3185001.50, 3185001.01]) {
    for (const cuotas of [1, 2, 3, 6, 9, 24]) {
      const p = a.crearPlanFijoGalicia(total, cuotas);
      assert.equal(p.totalSinRedondeo,total);
      assert.ok(p.montoRecuperar>=total);
      assert.ok(p.montoRecuperar-total<2*cuotas);
      assert.equal(p.pagos.reduce((s, x) => s + x.importe, 0), p.montoRecuperar);
      for (const pago of p.pagos) {
        for(const importe of [pago.importe,pago.banco,pago.honorarios]) assert.equal(Number.isInteger(importe),true);
        assert.equal(a.aCentavos(pago.banco) + a.aCentavos(pago.honorarios), a.aCentavos(pago.importe));
      }
    }
  }
  assert.throws(() => a.crearPlanFijoGalicia(10000000,25), /1 a 24/);
});

test("propiedades con oráculo entero independiente para deuda, quita y cuotas", () => {
  const a = cargar();
  let semilla = 20261009;
  for (let i = 0; i < 200; i++) {
    semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0;
    const deudaCent = 10000000 + semilla;
    for (const cuotas of [1, 2, 3, 4, 6, 9]) {
      for (const bps of [0, 2000, 6000, 8000, 8500]) {
        const num = BigInt(deudaCent) * 1242n * BigInt(10000 - bps);
        const den = 1000000000n * BigInt(cuotas);
        const previo = Number((num + den - 1n) / den);
        // Oráculo independiente con cociente/resto, primero a centavos y luego a pesos.
        const bancoCent = Math.trunc(previo*100*500/621)+(previo*100*500%621 ? 1 : 0);
        const honCent = previo*100-bancoCent;
        const banco = Math.trunc(bancoCent/100)+(bancoCent%100 ? 1 : 0);
        const honorarios = Math.trunc(honCent/100)+(honCent%100 ? 1 : 0);
        const esperado = banco+honorarios;
        const p = a.calcularPlanGalicia(deudaCent / 100, cuotas, bps / 10000);
        assert.equal(p.valorCuota, esperado);
        assert.equal(p.montoRecuperar, esperado * cuotas);
        assert.equal(p.pagos[0].banco,banco);
        assert.equal(p.pagos[0].honorarios,honorarios);
        assert.equal(p.totalSinRedondeo,previo*cuotas);
        for (const pago of p.pagos) {
          assert.equal(a.aCentavos(pago.banco) + a.aCentavos(pago.honorarios), a.aCentavos(pago.importe));
        }
      }
    }
  }
});

test("el redondeo no rescata importes fuera de pauta ni añade interés en TNA 0",()=>{
  const a=cargar();
  const bajo=a.crearPlanFijoGalicia(3185021.06,6);
  assert.ok(a.validarPropuestaGalicia({deuda:6411073,cuotas:6,total:bajo.montoRecuperar,totalSinRedondeo:bajo.totalSinRedondeo,...contexto}).length);
  const cero=a.calcularAcuerdoGalicia(10000000,24,0);
  const propuesta={deuda:10000000,cuotas:24,total:cero.montoRecuperar,totalSinRedondeo:cero.totalSinRedondeo,modalidad:"acuerdo0",...contexto,moraDias:630};
  assert.equal(cero.montoRecuperar,12420024);
  assert.deepEqual(Array.from(a.validarPropuestaGalicia(propuesta)),[]);
  assert.ok(a.validarPropuestaGalicia({...propuesta,totalSinRedondeo:12420001}).length);
  assert.ok(a.validarPropuestaGalicia({...propuesta,total:12420048}).length);
});

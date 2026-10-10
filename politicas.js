"use strict";

// Fuente: pautas del 07/10/2026 y ajuste del usuario del 09/10/2026.
const POLITICA_GALICIA = Object.freeze({
  desde: "2026-10-07",
  hasta: "2026-10-31",
  limitesQuita: Object.freeze({ 1: .85, 2: .80, 3: .80, 4: .60, 5: .60, 6: .60, 7: .60, 8: .60, 9: .60 }),
  deudaNuevePagos: 20000000,
  deudaAcuerdoCero: 10000000,
  moraAcuerdoCero: 630,
  mesesAcuerdoCero: 24,
  restriccionesInternasAnteriores: false,
});

function hoyArgentina(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(fecha);
  const valor = tipo => partes.find(p => p.type === tipo).value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function aCentavos(importe) {
  const numero = Number(importe);
  const centavos = Math.round(numero * 100);
  if (!Number.isFinite(numero) || !Number.isSafeInteger(centavos) || numero < 0) {
    throw new Error("Ingresá un importe positivo válido, con hasta dos decimales.");
  }
  if (Math.abs(numero * 100 - centavos) > 0.00001) {
    throw new Error("Los importes deben tener como máximo dos decimales.");
  }
  return centavos;
}

function techoEntero(numerador, denominador) {
  return (numerador + denominador - 1n) / denominador;
}

function redondearPesoGalicia(importe) {
  // Los cálculos de referencia pueden tener ruido binario junto a un entero exacto.
  const numero = Number(importe);
  if (numero === 0) return 0;
  return Math.ceil(numero - Number.EPSILON * Math.max(1, Math.abs(numero)));
}

function minimoTotalGalicia(deuda, descuento) {
  const bps = Math.round(descuento * 10000);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error("Quita inválida.");
  return Number(techoEntero(BigInt(aCentavos(deuda)) * 1242n * BigInt(10000 - bps), 10000000n));
}

function limiteQuitaGalicia(cuotas, deuda) {
  if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 9) return null;
  if (cuotas > 6 && aCentavos(deuda) <= aCentavos(POLITICA_GALICIA.deudaNuevePagos)) return null;
  const limite = POLITICA_GALICIA.limitesQuita[cuotas];
  if (POLITICA_GALICIA.restriccionesInternasAnteriores && deuda < 250000) return Math.min(limite, .20);
  return limite;
}

function cuotasDisponiblesGalicia(deuda) {
  return Array.from({ length: deuda > POLITICA_GALICIA.deudaNuevePagos ? 9 : 6 }, (_, i) => i + 1);
}

function repartirPagoGalicia(importe) {
  const centavos = aCentavos(importe);
  // Primero conservar la distribución a centavos. Después subir AMBAS transferencias
  // al peso siguiente y recalcular el pago: no redondear sólo su presentación.
  const bancoCentavos = Number(techoEntero(BigInt(centavos) * 500n, 621n));
  const banco = Number(techoEntero(BigInt(bancoCentavos), 100n));
  const honorarios = Number(techoEntero(BigInt(centavos - bancoCentavos), 100n));
  return { importe: banco + honorarios, banco, honorarios };
}

function crearPlanFijoGalicia(total, cuotas) {
  const totalCentavos = aCentavos(total);
  if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > POLITICA_GALICIA.mesesAcuerdoCero || totalCentavos < cuotas) {
    throw new Error("El total debe permitir al menos un centavo por pago (1 a 24 pagos).");
  }
  const cuotaCentavos = Math.floor(totalCentavos / cuotas);
  const pagos = Array.from({ length: cuotas }, (_, i) => repartirPagoGalicia(
    (i === cuotas - 1 ? totalCentavos - cuotaCentavos * (cuotas - 1) : cuotaCentavos) / 100
  ));
  const capitalBanco = pagos.reduce((s, p) => s + p.banco, 0);
  const honorariosAgencia = pagos.reduce((s, p) => s + p.honorarios, 0);
  return {
    montoRecuperar: capitalBanco + honorariosAgencia, totalSinRedondeo: totalCentavos / 100,
    valorCuota: pagos[0].importe,
    ultimaCuota: pagos[cuotas - 1].importe, cuotas, pagos, capitalBanco, honorariosAgencia,
  };
}

function calcularPlanGalicia(deuda, cuotas, descuento) {
  const deudaCentavos = aCentavos(deuda);
  const bps = Math.round(descuento * 10000);
  if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 9 || !Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error("Plan o quita inválidos.");
  }
  // Cociente racional exacto: quita sobre deuda financiera, honorarios proporcionales.
  const valorCuota = Number(techoEntero(
    BigInt(deudaCentavos) * 1242n * BigInt(10000 - bps), 1000000000n * BigInt(cuotas)
  ));
  const plan = crearPlanFijoGalicia(valorCuota * cuotas, cuotas);
  const deudaConHonorarios = deudaCentavos * 1.242 / 100;
  return {
    ...plan, deudaConHonorarios, montoDescuento: Math.max(0, deudaConHonorarios - plan.montoRecuperar),
    porcentaje: bps / 100, quitaSolicitada: bps / 10000, hab: plan.montoRecuperar * .16, had: plan.honorariosAgencia,
    modalidad: "quita", tna: 0,
  };
}

function calcularAcuerdoGalicia(deuda, cuotas, tna = 0) {
  if (tna !== 0) throw new Error("TNA no permitida.");
  const total = minimoTotalGalicia(deuda, 0) / 100;
  return {
    ...crearPlanFijoGalicia(total, cuotas), deudaConHonorarios: aCentavos(deuda) * 1.242 / 100,
    porcentaje: 0, montoDescuento: 0, tna: 0, modalidad: "acuerdo0",
    hab: total * .16,
  };
}

function fechaISOValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

function validarPropuestaGalicia({ deuda, cuotas, total, totalSinRedondeo = total, fecha = hoyArgentina(), primeraCuota, moraDias,
  modalidad = "quita", vencimiento = null, quitaSolicitada = null }) {
  const errores = [];
  if (!fechaISOValida(fecha) || fecha < POLITICA_GALICIA.desde || fecha > POLITICA_GALICIA.hasta) {
    errores.push("Las pautas vigentes aplican del 07/10/2026 al 31/10/2026. Actualizá la política para emitir fuera de ese período.");
  }
  if (!fechaISOValida(primeraCuota) || primeraCuota < fecha) errores.push("Indicá una primera cuota válida, desde hoy.");
  if (vencimiento && (!fechaISOValida(vencimiento) || vencimiento < fecha || vencimiento > POLITICA_GALICIA.hasta)) {
    errores.push("El vencimiento debe ser desde hoy y hasta el 31/10/2026.");
  }
  if (!Number.isFinite(deuda) || deuda <= 0 || !Number.isFinite(total) || total <= 0 || !Number.isInteger(cuotas)) {
    errores.push("Deuda, total y cantidad de pagos deben ser válidos y positivos.");
    return errores;
  }
  try { aCentavos(deuda); aCentavos(total); aCentavos(totalSinRedondeo); }
  catch (e) { errores.push(e.message); return errores; }
  // La pauta se controla ANTES de redondear: subir centavos no habilita quitas fuera
  // de tope ni financiación extra. El incremento sólo puede ser el redondeo por pago.
  if (totalSinRedondeo <= 0 || total < totalSinRedondeo || total - totalSinRedondeo >= 2 * cuotas) {
    errores.push("El total no coincide con el redondeo hacia arriba de los pagos.");
  }
  if (modalidad === "acuerdo0") {
    const max = POLITICA_GALICIA.mesesAcuerdoCero;
    if (cuotas < 1 || cuotas > max) errores.push(`Este acuerdo permite hasta ${max} meses.`);
    if (!(deuda >= POLITICA_GALICIA.deudaAcuerdoCero && Number.isInteger(moraDias) && moraDias >= POLITICA_GALICIA.moraAcuerdoCero)) {
      errores.push("TNA 0%: deuda financiera de al menos $10.000.000 y mora de al menos 630 días.");
    }
    if (aCentavos(totalSinRedondeo) < minimoTotalGalicia(deuda, 0)) errores.push("Estos acuerdos no incluyen quita; el total no puede ser inferior a la deuda con honorarios.");
    if (aCentavos(totalSinRedondeo) > minimoTotalGalicia(deuda, 0)) errores.push("TNA 0%: el total debe ser la deuda con honorarios, sin financiación adicional.");
  } else if (modalidad === "quita") {
    const limite = limiteQuitaGalicia(cuotas, deuda);
    if (limite === null) errores.push("Hasta 6 pagos; de 7 a 9 pagos sólo para deuda financiera mayor a $20.000.000.");
    else if (aCentavos(totalSinRedondeo) < minimoTotalGalicia(deuda, limite)) errores.push(`El importe supera la quita máxima de ${limite * 100}% para ${cuotas} pago/s.`);
    if (quitaSolicitada !== null && (!Number.isFinite(quitaSolicitada) || quitaSolicitada < 0 || limite === null || quitaSolicitada > limite)) {
      errores.push("La quita anunciada supera la pauta del plan.");
    }
    if (cuotas >= 2 && cuotas <= 3 && (!primeraCuota || primeraCuota.slice(0, 7) !== "2026-10")) {
      errores.push("En planes de hasta 3 pagos, la primera cuota debe ingresarse en octubre de 2026.");
    }
    if (cuotas === 1 && primeraCuota > POLITICA_GALICIA.hasta) errores.push("El pago contado debe ingresarse durante la vigencia de la campaña.");
    if (cuotas >= 1 && cuotas <= 9 && aCentavos(totalSinRedondeo) > aCentavos(calcularPlanGalicia(deuda, cuotas, 0).totalSinRedondeo)) {
      errores.push("El total supera la deuda con honorarios; utilizá la modalidad de acuerdo correspondiente.");
    }
  } else {
    errores.push("Modalidad de acuerdo inválida.");
  }
  return errores;
}

// Sistema de gestión de tareas modulares
import * as clima from "./clima.js"
import * as noticias from "./noticias.js"
import * as ia from "./ia.js"
import * as chistes from "./chistes.js"

// Registro de todas las tareas disponibles
export const tareasDisponibles = {
  clima: {
    modulo: clima,
    config: clima.climaConfig,
  },
  noticias: {
    modulo: noticias,
    config: noticias.noticiasConfig,
  },
  ia: {
    modulo: ia,
    config: ia.iaConfig,
  },
  chistes: {
    modulo: chistes,
    config: chistes.chistesConfig,
  },
}

// Función para obtener configuración de servicios
export function obtenerConfiguracionServicios() {
  return Object.values(tareasDisponibles).map((tarea) => tarea.config)
}

// Función para validar servicios
export function validarServicios(serviciosSeleccionados) {
  const serviciosValidos = Object.keys(tareasDisponibles)
  return serviciosSeleccionados.filter((servicio) => serviciosValidos.includes(servicio))
}

// Función para obtener comandos de un servicio
export function obtenerComandosServicio(nombreServicio) {
  const tarea = tareasDisponibles[nombreServicio]
  return tarea ? tarea.config.commands : []
}

// Función para verificar si un servicio requiere API key
export function servicioRequiereApiKey(nombreServicio) {
  const tarea = tareasDisponibles[nombreServicio]
  return tarea ? tarea.config.requiresApiKey : false
}

// Función para agregar nueva tarea (para futuras expansiones)
export function registrarNuevaTarea(nombre, modulo, config) {
  if (tareasDisponibles[nombre]) {
    console.warn(`⚠️ Tarea '${nombre}' ya existe, será sobrescrita`)
  }

  tareasDisponibles[nombre] = {
    modulo,
    config,
  }

  console.log(`✅ Nueva tarea registrada: ${nombre}`)
}

// Exportar funciones específicas para compatibilidad
export const { programarClimaUTC, enviarClimaInstantaneo } = clima

export const { programarNoticiaUTC, enviarNoticiaInstantanea } = noticias

export const { responderConIA } = ia

export const { configurarChistes } = chistes

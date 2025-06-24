// Archivo de compatibilidad - importa del sistema modular
export * from "./tareas/index.js"

// Re-exportar para mantener compatibilidad con código existente
import {
  programarClimaUTC,
  enviarClimaInstantaneo,
  programarNoticiaUTC,
  enviarNoticiaInstantanea,
  responderConIA,
  configurarChistes,
} from "./tareas/index.js"

export {
  programarClimaUTC,
  enviarClimaInstantaneo,
  programarNoticiaUTC,
  enviarNoticiaInstantanea,
  responderConIA,
  configurarChistes,
}

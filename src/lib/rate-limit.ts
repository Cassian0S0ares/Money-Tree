const MAX_FALHAS = 5
const JANELA_MS = 15 * 60 * 1000

interface Registro {
  falhas: number
  primeiraFalhaEm: number
}

/**
 * Contagem em memória. Para uma aplicação local de instância única isso
 * basta e não acrescenta dependência. Reiniciar o servidor zera a contagem —
 * limitação aceita e registrada: se o Money Tree passar a rodar em mais de
 * uma instância, isto precisa ir para o banco.
 */
const registros = new Map<string, Registro>()

export function verificarLimite(
  chave: string,
  maximo = MAX_FALHAS,
): { permitido: boolean; esperarSegundos: number } {
  const registro = registros.get(chave)
  if (!registro) return { permitido: true, esperarSegundos: 0 }

  const decorrido = Date.now() - registro.primeiraFalhaEm
  if (decorrido > JANELA_MS) {
    registros.delete(chave)
    return { permitido: true, esperarSegundos: 0 }
  }

  if (registro.falhas >= maximo) {
    return { permitido: false, esperarSegundos: Math.ceil((JANELA_MS - decorrido) / 1000) }
  }

  return { permitido: true, esperarSegundos: 0 }
}

export function registrarTentativa(chave: string, sucesso: boolean): void {
  if (sucesso) {
    registros.delete(chave)
    return
  }

  const registro = registros.get(chave)
  if (!registro || Date.now() - registro.primeiraFalhaEm > JANELA_MS) {
    registros.set(chave, { falhas: 1, primeiraFalhaEm: Date.now() })
    return
  }

  registro.falhas += 1
}

/** Só para teste. */
export function limparLimites(): void {
  registros.clear()
}

'use client'

import { ErroRecuperavel } from '../../components/states'

/**
 * Falha ao carregar uma página do app. Leitura não altera nada, então o que
 * foi preservado é tudo: dizer isso evita o susto de achar que dados sumiram.
 */
export default function ErroApp({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErroRecuperavel
      oQueAconteceu="Não foi possível carregar esta página."
      oQueFoiPreservado="Seus dados não foram alterados: a falha aconteceu só na leitura."
      comoCorrigir="Verifique a conexão e tente de novo. Se persistir, volte mais tarde."
      aoTentarNovamente={reset}
    />
  )
}

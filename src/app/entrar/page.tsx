'use client'

import { useActionState } from 'react'
import { entrar, type EstadoEntrar } from './acoes'
import { Aviso, Cartao, Marca, Rotulo, classeEntrada, classesBotao } from '../../components/ui'

const INICIAL: EstadoEntrar = {}

export default function PaginaEntrar() {
  const [estado, acao, enviando] = useActionState(entrar, INICIAL)

  return (
    <main id="conteudo" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca className="text-xl" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">Entrar</h1>
          <p className="mt-1 text-sm text-slate-600">Veja quanto você tem, conta por conta.</p>
        </div>

        <Cartao className="p-6">
          {/* O e-mail volta preenchido depois do erro (§13); a senha não. */}
          <form action={acao} className="space-y-4">
            {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

            <div>
              <Rotulo htmlFor="email">E-mail</Rotulo>
              <input
                id="email" name="email" type="email" autoComplete="username" required
                defaultValue={estado.email ?? ''}
                aria-invalid={estado.erro ? true : undefined}
                className={classeEntrada}
              />
            </div>

            <div>
              <Rotulo htmlFor="senha">Senha</Rotulo>
              <input
                id="senha" name="senha" type="password" autoComplete="current-password" required
                aria-invalid={estado.erro ? true : undefined}
                className={classeEntrada}
              />
            </div>

            {/* Desabilitado enquanto envia: impede envio duplicado (§13). */}
            <button type="submit" disabled={enviando} className={classesBotao('primario', 'w-full')}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </Cartao>

        <p className="mt-6 text-center text-xs text-slate-500">
          Por segurança, a sessão se encerra sozinha depois de um tempo sem uso.
        </p>
      </div>
    </main>
  )
}

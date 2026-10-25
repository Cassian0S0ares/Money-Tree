'use client'

import { useActionState } from 'react'
import { salvarPreferencias, type EstadoPreferencias } from './acoes'
import type { Usuario } from '../../../data/users'
import { Aviso, Dica, Rotulo, classeEntrada, classesBotao } from '../../../components/ui'

const FUSOS = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Cuiaba',
  'America/Rio_Branco',
  'America/Noronha',
]

const INICIAL: EstadoPreferencias = {}

export function FormularioPreferencias({ usuario }: { usuario: Usuario }) {
  const [estado, acao, enviando] = useActionState(salvarPreferencias, INICIAL)

  // Fuso fora da lista (definido antes, ou vindo de outro lugar) continua
  // selecionável, em vez de o <select> trocá-lo em silêncio pelo primeiro.
  const fusos = FUSOS.includes(usuario.timezone) ? FUSOS : [usuario.timezone, ...FUSOS]

  return (
    <form action={acao} className="space-y-4">
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.sucesso && <Aviso tipo="sucesso">Preferências salvas.</Aviso>}

      <div>
        <Rotulo htmlFor="displayName">Nome</Rotulo>
        <input
          id="displayName" name="displayName" required defaultValue={usuario.displayName}
          className={classeEntrada}
        />
      </div>

      <div>
        <Rotulo htmlFor="timezone">Fuso horário</Rotulo>
        <select
          id="timezone" name="timezone" defaultValue={usuario.timezone}
          className={classeEntrada}
        >
          {fusos.map((fuso) => (
            <option key={fuso} value={fuso}>{fuso}</option>
          ))}
        </select>
        <Dica>
          Define qual é &quot;hoje&quot; para vencimentos e lançamentos.
        </Dica>
      </div>

      <div>
        <Rotulo htmlFor="monthStartDay">
          Dia em que seu mês financeiro começa
        </Rotulo>
        <input
          id="monthStartDay" name="monthStartDay" type="number" min={1} max={31}
          defaultValue={usuario.monthStartDay}
          className={`${classeEntrada} w-32`}
        />
        <Dica>
          Use o dia do salário se preferir que o período acompanhe sua renda.
        </Dica>
      </div>

      <button
        type="submit" disabled={enviando}
        className={classesBotao('primario')}
      >
        {enviando ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  )
}

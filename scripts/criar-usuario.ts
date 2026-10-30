/**
 * Cria um usuário no banco do .env. Não há cadastro pela interface: o app é
 * individual, e uma rota pública de cadastro seria superfície de ataque sem
 * benefício.
 *
 *   npm run usuario:criar
 *
 * A senha é pedida no terminal, sem eco, e nunca por argumento: argumento
 * fica no histórico do shell e aparece na lista de processos.
 */
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { sql } from '../src/data/db'
import { criarUsuarioComSenha } from '../src/data/users'

const Dados = z.object({
  email: z.email('E-mail inválido.'),
  nome: z.string().trim().min(1, 'Informe o nome.'),
  senha: z.string().min(12, 'A senha precisa de pelo menos 12 caracteres.'),
})

let mudo = false
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
// Com `mudo`, o readline continua lendo mas não ecoa o que é digitado.
const escrever = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput
;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
  if (!mudo) escrever.call(rl, s)
}

function perguntar(texto: string, oculto = false): Promise<string> {
  return new Promise((resolver) => {
    mudo = false
    rl.question(texto, (resposta) => {
      mudo = false
      if (oculto) process.stdout.write('\n')
      resolver(resposta)
    })
    mudo = oculto
  })
}

async function principal() {
  const email = (await perguntar('E-mail: ')).trim()
  const nome = await perguntar('Nome: ')
  const senha = await perguntar('Senha: ', true)
  const confirmacao = await perguntar('Repita a senha: ', true)
  rl.close()

  if (senha !== confirmacao) {
    console.error('As senhas não conferem.')
    process.exit(1)
  }

  const analise = Dados.safeParse({ email, nome, senha })
  if (!analise.success) {
    for (const problema of analise.error.issues) console.error(problema.message)
    process.exit(1)
  }

  try {
    const usuario = await criarUsuarioComSenha(analise.data)
    console.log(`Usuário criado: ${usuario.email}`)
  } catch (erro) {
    // 23505: violação do índice único de e-mail.
    if ((erro as { code?: string }).code === '23505') {
      console.error('Já existe um usuário com esse e-mail.')
      process.exit(1)
    }
    throw erro
  } finally {
    await sql().end()
  }
}

principal()

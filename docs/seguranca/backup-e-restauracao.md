# Backup e restauração

## Pré-requisitos

- `pg_dump` e `psql` da versão 17, a mesma do servidor. No Ubuntu:
  `sudo apt install postgresql-client-17` (repositório PGDG).
- `gpg`, que já vem na maioria das distribuições.

## Como criar um backup

```bash
export MT_BACKUP_PASSPHRASE='<frase longa, do gerenciador de senhas>'
./scripts/backup.sh
```

O backup inclui só o schema `public`; os schemas internos do Supabase ficam
de fora. O arquivo vai para `backups/`, que o `.gitignore` bloqueia. Guarde-o
fora do repositório e fora da máquina: um backup que mora no mesmo disco do
banco não protege contra a perda desse disco.

## Cifragem

`gpg --symmetric`, AES-256, com proteção de integridade e chave derivada da
frase com SHA-512 e 65 milhões de iterações. Foi escolhido em vez de
`openssl enc`, que não aceita modo autenticado: com ele, um arquivo
adulterado poderia decifrar para lixo sem aviso. Com o `gpg`, frase errada e
arquivo adulterado falham na decifragem. As duas recusas foram conferidas em
2026-10-25.

A frase é passada por descritor de arquivo, nunca na linha de comando, para
não aparecer na lista de processos.

## Como testar a restauração

Em um terminal, suba um Postgres descartável. Ele fica na porta 55434 e
apaga os dados ao sair:

```bash
npx tsx scripts/postgres-descartavel.ts
```

Em outro terminal:

```bash
export MT_BACKUP_PASSPHRASE='<a mesma frase>'
./scripts/restore-test.sh backups/<arquivo>
```

O script restaura e imprime as contagens e os saldos. Se os saldos
conferirem com os do sistema, o backup está bom. Ele se recusa a rodar contra
um endereço que não seja local, porque apaga e recria um banco.

O `gpg` só confirma a integridade no fim do arquivo. Se um backup adulterado
for restaurado, parte dele já pode ter entrado no banco de teste quando o
erro aparece. O script falha nesse caso; descarte o banco de teste.

## A chave

A frase secreta nunca entra no repositório, em variável de ambiente
persistida nem em log. Guarde-a em um gerenciador de senhas.

**Perder a frase torna o backup irrecuperável.** Não há recuperação, e é de
propósito: um backup que alguém abre sem a chave não protege nada.

## Registro de restaurações testadas

| Data | Arquivo | Resultado |
|---|---|---|
| | | |

Anote cada teste aqui. Backup nunca testado é backup que não existe.

**Situação em 2026-10-25:** o ciclo completo ainda não foi executado,
porque a máquina de desenvolvimento não tem `pg_dump` nem `psql`. Só a parte
de cifragem foi testada. O critério de pronto 12 continua em aberto.

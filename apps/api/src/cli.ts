import { createInterface } from 'node:readline/promises'
import { runCli } from './cli-commands.ts'

/** Reads a line from the terminal without showing what is typed. */
function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process
  return new Promise((resolve, reject) => {
    stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const finish = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          finish()
          resolve(value)
          return
        }
        if (char === '\u0003') {
          finish()
          reject(new Error('Cancelled'))
          return
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char
      }
    }
    stdin.on('data', onData)
  })
}

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    const first = await readHidden('New password: ')
    const second = await readHidden('Repeat it: ')
    if (first !== second) throw new Error('The two passwords differ. Nothing was changed.')
    return first
  }
  // Piped input: the whole of stdin is the password, minus one trailing newline.
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '')
}

/** Reads a secret value: hidden on a terminal, the whole of stdin when piped. */
async function readSecret(): Promise<string> {
  if (process.stdin.isTTY) return readHidden('Secret value: ')
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '')
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  } finally {
    rl.close()
  }
}

process.exitCode = await runCli(process.argv.slice(2), process.env, {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  readPassword,
  readSecret,
  confirm,
})

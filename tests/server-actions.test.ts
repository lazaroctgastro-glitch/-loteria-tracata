import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

/**
 * Next.js exige que un archivo con la directiva `'use server'` exporte
 * únicamente funciones async: cualquier otra exportación hace que la acción
 * falle EN EJECUCIÓN con "A 'use server' file can only export async functions",
 * y el `next build` no lo detecta. Esta comprobación sí.
 */
const SRC = join(__dirname, '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

function hasUseServerDirective(source: ts.SourceFile): boolean {
  const first = source.statements[0]
  return Boolean(
    first &&
      ts.isExpressionStatement(first) &&
      ts.isStringLiteral(first.expression) &&
      first.expression.text === 'use server',
  )
}

const isAsync = (node: ts.Node) =>
  ts.canHaveModifiers(node) &&
  ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) &&
  ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

/** Exportaciones que Next.js rechazaría, con su motivo. */
function invalidExports(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  if (!hasUseServerDirective(source)) return []

  const problems: string[] = []

  for (const statement of source.statements) {
    // Los tipos desaparecen al compilar, así que no cuentan como exportación.
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue
    if (!isExported(statement)) continue

    if (ts.isFunctionDeclaration(statement)) {
      if (!isAsync(statement)) {
        problems.push(`la función "${statement.name?.text}" no es async`)
      }
      continue
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const value = declaration.initializer
        const isAsyncFunctionValue =
          value !== undefined &&
          (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) &&
          isAsync(value)
        if (!isAsyncFunctionValue) {
          problems.push(
            `"${declaration.name.getText(source)}" es un valor, no una función async` +
              ' (llévalo a otro archivo, por ejemplo src/lib/action-state.ts)',
          )
        }
      }
      continue
    }

    if (ts.isExportDeclaration(statement)) {
      // `export { x } from '...'` reexporta valores que no se pueden comprobar aquí.
      if (!statement.isTypeOnly) {
        problems.push('reexporta valores de otro módulo')
      }
      continue
    }

    problems.push(`exporta ${ts.SyntaxKind[statement.kind]}`)
  }

  return problems
}

describe('Archivos con "use server"', () => {
  const files = sourceFiles(SRC)

  it('existe al menos un archivo de acciones de servidor', () => {
    const serverFiles = files.filter((file) =>
      invalidExports(file) !== null && readFileSync(file, 'utf8').startsWith("'use server'"),
    )
    expect(serverFiles.length).toBeGreaterThan(0)
  })

  it('solo exportan funciones async', () => {
    const problems = files.flatMap((file) =>
      invalidExports(file).map((problem) => `${file.replace(SRC, 'src')}: ${problem}`),
    )
    expect(problems).toEqual([])
  })
})

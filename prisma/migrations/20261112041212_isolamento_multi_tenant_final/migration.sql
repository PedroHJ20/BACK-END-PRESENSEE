/*
  Warnings:

  - A unique constraint covering the columns `[escolaId,registration]` on the table `alunos` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[escolaId,email]` on the table `alunos` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "alunos_email_key";

-- DropIndex
DROP INDEX "alunos_registration_key";

-- AlterTable
ALTER TABLE "alunos" ADD COLUMN     "escolaId" TEXT;

-- AlterTable
ALTER TABLE "ocorrencias" ADD COLUMN     "escolaId" TEXT,
ALTER COLUMN "studentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "turmas" ADD COLUMN     "escolaId" TEXT;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "escolaId" TEXT,
ADD COLUMN     "primeiroAcesso" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "telefone" TEXT;

-- CreateTable
CREATE TABLE "eventos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "excusesAbsence" BOOLEAN NOT NULL DEFAULT false,
    "audience" TEXT NOT NULL,
    "escolaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escolas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "rede" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "inep" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "uf" TEXT,
    "telefone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escolas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chamados" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "escola" TEXT,
    "escolaId" TEXT,
    "solicitante" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "responsavel" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'Normal',
    "status" TEXT NOT NULL DEFAULT 'Aberto',
    "avaliacao" INTEGER,
    "mensagens" JSONB NOT NULL DEFAULT '[]',
    "historico" JSONB NOT NULL DEFAULT '[]',
    "notificacoes" JSONB NOT NULL DEFAULT '[]',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chamados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicados" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Informativo',
    "publico" TEXT NOT NULL DEFAULT 'Todas as escolas',
    "escolas" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Rascunho',
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alteradoEm" TIMESTAMP(3) NOT NULL,
    "publicadoEm" TIMESTAMP(3),

    CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "entidade" TEXT,
    "responsavel" TEXT NOT NULL DEFAULT 'Sistema',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alunos_escolaId_registration_key" ON "alunos"("escolaId", "registration");

-- CreateIndex
CREATE UNIQUE INDEX "alunos_escolaId_email_key" ON "alunos"("escolaId", "email");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "escolas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "escolas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "escolas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "escolas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "escolas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "escolas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

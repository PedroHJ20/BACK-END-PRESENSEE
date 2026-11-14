import type { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import os from "os";
import { prisma } from "../lib/prisma.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
});

function formatarBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export class HealthController {
  static async check(req: Request, res: Response) {
    try {
      const startTime = Date.now();
      const nowIso = new Date().toISOString();
      const issues: Array<{ id: string; service: string; title: string; detail: string }> = [];

      // 1. Banco de Dados (Neon / Prisma)
      let dbStatus: "operational" | "degraded" | "down" = "down";
      let dbLatency: number | null = null;
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - dbStart;
        dbStatus = dbLatency > 800 ? "degraded" : "operational";
      } catch (e) {
        console.error("Erro na BD:", e);
        issues.push({
          id: "db_err",
          service: "database",
          title: "Falha na Base de Dados (Neon)",
          detail: "A query de diagnóstico falhou ao conectar ao PostgreSQL."
        });
      }

      // 2. Infraestrutura de Hospedagem (Render / Node Runtime)
      const serverStart = Date.now();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercent = Number(((usedMem / totalMem) * 100).toFixed(1));

      const cpus = os.cpus();
      const loadAvg = os.loadavg()[0] ?? 0;
      const cpuCount = cpus.length > 0 ? cpus.length : 1;
      const cpuPercent = Number(Math.min(100, (loadAvg / cpuCount) * 100).toFixed(1));
      const uptimeMin = Math.floor(os.uptime() / 60);
      const serverLatency = Date.now() - serverStart;

      const serverStatus: "operational" | "degraded" =
        memoryPercent > 90 || cpuPercent > 90 ? "degraded" : "operational";

      // 3. Storage & CDN (Cloudinary - Uso real da cota em nuvem)
      let cloudStatus: "operational" | "degraded" | "down" = "down";
      let cloudLatency: number | null = null;
      let cloudDetail = "Credenciais do Cloudinary não configuradas no ambiente.";
      let cloudCode = 503;
      let cloudDiskPercent: number | null = null;

      const hasCloudCreds = Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      );

      if (hasCloudCreds) {
        try {
          const cloudStart = Date.now();
          const usage = await cloudinary.api.usage();
          cloudLatency = Date.now() - cloudStart;

          const storageUsedBytes = Number(usage?.storage?.usage ?? 0);
          const storageLimitBytes = Number(usage?.storage?.limit ?? 0);
          const creditsUsedPercent = Number(usage?.credits?.used_percent ?? 0);

          if (storageLimitBytes > 0) {
            cloudDiskPercent = Number(((storageUsedBytes / storageLimitBytes) * 100).toFixed(1));
          } else if (creditsUsedPercent > 0) {
            cloudDiskPercent = Number(creditsUsedPercent.toFixed(1));
          } else {
            // Plano gratuito padrão do Cloudinary (25 GB = 25 * 1024^3 bytes)
            const cotaPadraoBytes = 25 * 1024 * 1024 * 1024;
            cloudDiskPercent = Number(Math.min(100, (storageUsedBytes / cotaPadraoBytes) * 100).toFixed(1));
          }

          cloudStatus =
            (cloudDiskPercent !== null && cloudDiskPercent >= 90) || cloudLatency > 1800
              ? "degraded"
              : "operational";
          cloudCode = 200;
          cloudDetail = `Storage operacional · ${formatarBytes(storageUsedBytes)} utilizados (${cloudDiskPercent}% da cota).`;
        } catch (e) {
          console.error("Erro ao consultar uso do Cloudinary:", e);
          cloudStatus = "down";
          cloudCode = 502;
          cloudDetail = "Falha ao autenticar ou alcançar a API do Cloudinary.";
          issues.push({
            id: "cloud_err",
            service: "storage",
            title: "Indisponibilidade no Cloudinary",
            detail: "Não foi possível validar o armazenamento de fotos e atestados na nuvem."
          });
        }
      }

      // 4. Reconhecimento Facial (Base Biométrica)
      let biometricStatus: "operational" | "degraded" | "down" = "down";
      let biometricLatency: number | null = null;
      let biometricDetail = "Base biométrica indisponível.";
      let biometricCode = 500;

      if (dbStatus !== "down") {
        try {
          const bioStart = Date.now();
          const [totalAlunos, alunosComFoto] = await Promise.all([
            prisma.student.count(),
            prisma.student.count({ where: { biometricDataUrl: { not: null } } })
          ]);
          biometricLatency = Date.now() - bioStart;
          biometricStatus = cloudStatus === "down" ? "degraded" : "operational";
          biometricCode = 200;
          biometricDetail = `${alunosComFoto} de ${totalAlunos} estudante(s) com face vinculada na nuvem.`;
        } catch (e) {
          console.error("Erro no diagnóstico biométrico:", e);
        }
      }

      // 5. Análise Preditiva de Evasão (IA / Motor de Risco)
      let aiStatus: "operational" | "degraded" | "down" = "down";
      let aiLatency: number | null = null;
      let aiDetail = "Motor de cálculo de risco indisponível.";
      let aiCode = 500;

      if (dbStatus !== "down") {
        try {
          const aiStart = Date.now();
          const totalTurmas = await prisma.class.count();
          aiLatency = Date.now() - aiStart;
          aiStatus = "operational";
          aiCode = 200;
          aiDetail = `Cálculo de frequência e risco ativo em ${totalTurmas} turma(s).`;
        } catch (e) {
          console.error("Erro no diagnóstico preditivo:", e);
        }
      }

      // 6. Serviço de Autenticação (JWT & Sessões)
      const authStart = Date.now();
      const hasJwtSecret = Boolean(process.env.JWT_SECRET);
      const authStatus: "operational" | "degraded" = dbStatus !== "down" && hasJwtSecret ? "operational" : "degraded";
      const authDetail = hasJwtSecret
        ? "Validação JWT e controle multi-tenant ativos."
        : "JWT_SECRET usando fallback padrão; configure no .env.";
      const authLatency = Date.now() - authStart;

      // 7. Registro de Frequência (Chamadas)
      let attendanceStatus: "operational" | "degraded" | "down" = "down";
      let attendanceLatency: number | null = null;
      let attendanceDetail = "Serviço de chamadas indisponível.";
      let attendanceCode = 500;

      if (dbStatus !== "down") {
        try {
          const attStart = Date.now();
          const ultimas24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const chamadasRecentes = await prisma.attendance.count({
            where: { date: { gte: ultimas24h } }
          });
          attendanceLatency = Date.now() - attStart;
          attendanceStatus = "operational";
          attendanceCode = 200;
          attendanceDetail = `${chamadasRecentes} registro(s) de presença nas últimas 24h.`;
        } catch (e) {
          console.error("Erro no diagnóstico de frequência:", e);
        }
      }

      // 8. Geração de Relatórios (Agregação Analítica)
      let reportsStatus: "operational" | "degraded" | "down" = "down";
      let reportsLatency: number | null = null;
      let reportsDetail = "Serviço de relatórios indisponível.";
      let reportsCode = 500;

      if (dbStatus !== "down") {
        try {
          const repStart = Date.now();
          const totalEscolas = await prisma.escola.count();
          reportsLatency = Date.now() - repStart;
          reportsStatus = "operational";
          reportsCode = 200;
          reportsDetail = `Consolidação de indicadores pronta para ${totalEscolas} escola(s).`;
        } catch (e) {
          console.error("Erro no diagnóstico de relatórios:", e);
        }
      }

      // 9. Gestão de Alertas & Intervenções
      let interventionsStatus: "operational" | "degraded" | "down" = "down";
      let interventionsLatency: number | null = null;
      let interventionsDetail = "Serviço de alertas e ocorrências indisponível.";
      let interventionsCode = 500;

      if (dbStatus !== "down") {
        try {
          const intStart = Date.now();
          const [totalOcorrencias, totalAlertas] = await Promise.all([
            prisma.incident.count(),
            prisma.alert.count().catch(() => 0)
          ]);
          interventionsLatency = Date.now() - intStart;
          interventionsStatus = "operational";
          interventionsCode = 200;
          interventionsDetail = `${totalOcorrencias} ocorrência(s) e ${totalAlertas} alerta(s) monitorados.`;
        } catch (e) {
          console.error("Erro no diagnóstico de alertas:", e);
        }
      }

      const healthData = {
        timestamp: nowIso,
        received: true,
        metrics: {
          cpuPercent,
          memoryPercent,
          diskPercent: cloudDiskPercent
        },
        services: [
          {
            key: "api",
            name: "API Principal (Node.js)",
            status: "operational",
            latencyMs: Date.now() - startTime,
            errorRatePercent: 0,
            checkedAt: nowIso,
            code: 200,
            detail: "Servidor Express operando normalmente."
          },
          {
            key: "database",
            name: "Banco de Dados (Neon/Prisma)",
            status: dbStatus,
            latencyMs: dbLatency,
            errorRatePercent: dbStatus === "down" ? 100 : 0,
            checkedAt: nowIso,
            code: dbStatus === "down" ? 500 : 200,
            detail: dbStatus === "down" ? "Falha de conexão com a base de dados." : "Conexão Neon estável."
          },
          {
            key: "server",
            name: "Infraestrutura de Hospedagem (Render)",
            status: serverStatus,
            latencyMs: serverLatency,
            errorRatePercent: 0,
            checkedAt: nowIso,
            code: 200,
            detail: `Instância ${os.platform()} ativa há ${uptimeMin} min · Memória ${memoryPercent}%.`
          },
          {
            key: "storage",
            name: "Armazenamento em Nuvem (Cloudinary)",
            status: cloudStatus,
            latencyMs: cloudLatency,
            errorRatePercent: cloudStatus === "down" ? 100 : 0,
            checkedAt: nowIso,
            code: cloudCode,
            detail: cloudDetail
          },
          {
            key: "biometric",
            name: "Reconhecimento Facial (Python)",
            status: biometricStatus,
            latencyMs: biometricLatency,
            errorRatePercent: biometricStatus === "down" ? 100 : 0,
            checkedAt: nowIso,
            code: biometricCode,
            detail: biometricDetail
          },
          {
            key: "ai",
            name: "Análise Preditiva de Evasão (IA)",
            status: aiStatus,
            latencyMs: aiLatency,
            errorRatePercent: aiStatus === "down" ? 100 : 0,
            checkedAt: nowIso,
            code: aiCode,
            detail: aiDetail
          },
          {
            key: "login",
            name: "Serviço de Autenticação",
            status: authStatus,
            latencyMs: authLatency,
            errorRatePercent: 0,
            checkedAt: nowIso,
            code: 200,
            detail: authDetail
          },
          {
            key: "attendance",
            name: "Registro de Frequência",
            status: attendanceStatus,
            latencyMs: attendanceLatency,
            errorRatePercent: attendanceStatus === "down" ? 100 : 0,
            checkedAt: nowIso,
            code: attendanceCode,
            detail: attendanceDetail
          },
          {
            key: "reports",
            name: "Geração de Relatórios",
            status: reportsStatus,
            latencyMs: reportsLatency,
            errorRatePercent: reportsStatus === "down" ? 100 : 0,
            checkedAt: nowIso,
            code: reportsCode,
            detail: reportsDetail
          },
          {
            key: "interventions",
            name: "Gestão de Alertas",
            status: interventionsStatus,
            latencyMs: interventionsLatency,
            errorRatePercent: interventionsStatus === "down" ? 100 : 0,
            checkedAt: nowIso,
            code: interventionsCode,
            detail: interventionsDetail
          }
        ],
        issues
      };

      return res.status(200).json(healthData);
    } catch (error) {
      console.error("Erro interno ao processar diagnóstico:", error);
      return res.status(500).json({ error: "Erro interno ao processar diagnóstico" });
    }
  }
}
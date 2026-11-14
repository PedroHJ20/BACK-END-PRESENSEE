import type { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import os from "os";
import { prisma } from "../lib/prisma.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
});

export class HealthController {
  static async check(req: Request, res: Response) {
    try {
      const startTime = Date.now();
      const nowIso = new Date().toISOString();
      const issues: Array<{ id: string; service: string; title: string; detail: string }> = [];

      // 1. Testa a ligação à Base de Dados (Neon/Prisma)
      let dbStatus: "operational" | "degraded" | "down" = "down";
      let dbLatency: number | null = null;
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - dbStart;
        dbStatus = dbLatency > 500 ? "degraded" : "operational";
      } catch (e) {
        console.error("Erro na BD:", e);
        issues.push({
          id: "db_err",
          service: "database",
          title: "Falha na Base de Dados (Neon)",
          detail: "A query de diagnóstico falhou ao conectar ao PostgreSQL."
        });
      }

      // 2. Testa o Armazenamento em Nuvem (Cloudinary - Biometria & Atestados)
      let cloudStatus: "operational" | "degraded" | "down" = "down";
      let cloudLatency: number | null = null;
      let cloudDetail = "Credenciais do Cloudinary não configuradas no servidor.";
      let cloudCode = 503;

      const hasCloudCreds = Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      );

      if (hasCloudCreds) {
        try {
          const cloudStart = Date.now();
          await cloudinary.api.ping();
          cloudLatency = Date.now() - cloudStart;
          cloudStatus = cloudLatency > 1200 ? "degraded" : "operational";
          cloudCode = 200;
          cloudDetail =
            cloudStatus === "degraded"
              ? `CDN respondendo com latência elevada (${cloudLatency} ms).`
              : "Storage de fotos biométricas e atestados médicos operacional.";
        } catch (e: any) {
          console.error("Erro no ping do Cloudinary:", e);
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
      } else {
        issues.push({
          id: "cloud_env_missing",
          service: "storage",
          title: "Credenciais Cloudinary Ausentes",
          detail: "Verifique CLOUDINARY_CLOUD_NAME, API_KEY e API_SECRET no ambiente."
        });
      }

      // 3. Verifica o Módulo de Reconhecimento Facial (Base Biométrica)
      let facialStatus: "operational" | "degraded" | "down" = "down";
      let facialLatency: number | null = null;
      let facialDetail = "Não foi possível consultar a base biométrica.";
      let facialCode = 500;

      if (dbStatus !== "down") {
        try {
          const facialStart = Date.now();
          const [totalAlunos, alunosComBiometria] = await Promise.all([
            prisma.student.count(),
            prisma.student.count({
              where: {
                biometricDataUrl: { not: null }
              }
            })
          ]);
          facialLatency = Date.now() - facialStart;

          if (cloudStatus === "down") {
            facialStatus = "degraded";
            facialCode = 206;
            facialDetail = `${alunosComBiometria}/${totalAlunos} alunos com biometria vinculada, mas storage em nuvem indisponível.`;
          } else if (totalAlunos > 0 && alunosComBiometria === 0) {
            facialStatus = "degraded";
            facialCode = 200;
            facialDetail = `0 de ${totalAlunos} alunos possuem foto biométrica cadastrada.`;
          } else {
            facialStatus = "operational";
            facialCode = 200;
            facialDetail = `${alunosComBiometria} de ${totalAlunos} estudante(s) prontos para reconhecimento facial.`;
          }
        } catch (e) {
          console.error("Erro ao verificar base biométrica:", e);
        }
      }

      // 4. Verifica o Motor de Frequência & Alertas (últimas 24h)
      let attendanceStatus: "operational" | "degraded" | "down" = "down";
      let attendanceLatency: number | null = null;
      let attendanceDetail = "Serviço de frequência indisponível.";
      let attendanceCode = 500;

      if (dbStatus !== "down") {
        try {
          const attStart = Date.now();
          const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const [chamadas24h, alertasAbertos] = await Promise.all([
            prisma.attendance.count({
              where: { date: { gte: vinteQuatroHorasAtras } }
            }),
            prisma.alert.count().catch(() => 0)
          ]);
          attendanceLatency = Date.now() - attStart;
          attendanceStatus = "operational";
          attendanceCode = 200;
          attendanceDetail = `${chamadas24h} registro(s) de presença nas últimas 24h · ${alertasAbertos} alerta(s) na base.`;
        } catch (e) {
          console.error("Erro ao verificar serviço de frequência:", e);
        }
      }

      // 5. Recursos do Servidor (Node.js/Render)
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercent = (usedMem / totalMem) * 100;

      const cpus = os.cpus();
      const loadAvg = os.loadavg()[0] ?? 0;
      const cpuCount = cpus.length > 0 ? cpus.length : 1;
      const cpuPercent = Math.min(100, (loadAvg / cpuCount) * 100);

      // 6. Monta a resposta no formato que o Front-end espera
      const healthData = {
        timestamp: nowIso,
        received: true,
        metrics: {
          cpuPercent: Number(cpuPercent.toFixed(1)),
          memoryPercent: Number(memoryPercent.toFixed(1)),
          diskPercent: null
        },
        services: [
          {
            key: "api",
            name: "API Principal (Node.js / Render)",
            status: "operational",
            latencyMs: Date.now() - startTime,
            checkedAt: nowIso,
            code: 200,
            detail: "Servidor Express e rotas REST operando normalmente."
          },
          {
            key: "database",
            name: "Banco de Dados (Neon / PostgreSQL)",
            status: dbStatus,
            latencyMs: dbLatency,
            checkedAt: nowIso,
            code: dbStatus === "down" ? 500 : 200,
            detail:
              dbStatus === "down"
                ? "Falha de conexão com a base de dados."
                : dbStatus === "degraded"
                  ? `Conexão ativa, mas com latência alta (${dbLatency} ms).`
                  : "Pool Prisma e conexão Neon estáveis."
          },
          {
            key: "storage",
            name: "Storage & CDN (Cloudinary)",
            status: cloudStatus,
            latencyMs: cloudLatency,
            checkedAt: nowIso,
            code: cloudCode,
            detail: cloudDetail
          },
          {
            key: "facial",
            name: "Módulo de Biometria Facial",
            status: facialStatus,
            latencyMs: facialLatency,
            checkedAt: nowIso,
            code: facialCode,
            detail: facialDetail
          },
          {
            key: "attendance",
            name: "Motor de Frequência & Alertas",
            status: attendanceStatus,
            latencyMs: attendanceLatency,
            checkedAt: nowIso,
            code: attendanceCode,
            detail: attendanceDetail
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
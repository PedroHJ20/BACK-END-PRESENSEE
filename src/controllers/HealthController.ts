import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import os from "os";

const prisma = new PrismaClient();

export class HealthController {
  static async check(req: Request, res: Response) {
    try {
      const startTime = Date.now();
      
      // 1. Testa a ligação à Base de Dados (Neon)
      let dbStatus = "down";
      let dbLatency: number | null = null;
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - dbStart;
        dbStatus = dbLatency > 500 ? "degraded" : "operational";
      } catch (e) {
        console.error("Erro na BD:", e);
      }

      // 2. Recursos do Servidor (Node.js/Render)
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercent = (usedMem / totalMem) * 100;
      
      const cpus = os.cpus();
      const loadAvg = os.loadavg()[0] ?? 0; // Evita o erro de undefined
      const cpuCount = cpus.length > 0 ? cpus.length : 1; // Evita divisão por zero
      const cpuPercent = (loadAvg / cpuCount) * 100;

      // 3. Monta a resposta no formato que o Front-end espera
      const healthData = {
        timestamp: new Date().toISOString(),
        received: true,
        metrics: {
          cpuPercent: Number(cpuPercent.toFixed(1)),
          memoryPercent: Number(memoryPercent.toFixed(1)),
          diskPercent: null
        },
        services: [
          {
            key: "api",
            name: "API Principal (Node.js)",
            status: "operational",
            latencyMs: Date.now() - startTime,
            checkedAt: new Date().toISOString(),
            code: 200,
            detail: "Servidor Express operando normalmente."
          },
          {
            key: "database",
            name: "Banco de Dados (Neon/Prisma)",
            status: dbStatus,
            latencyMs: dbLatency,
            checkedAt: new Date().toISOString(),
            code: dbStatus === "down" ? 500 : 200,
            detail: dbStatus === "down" ? "Falha de conexão com a DB." : "Conexão estável."
          }
        ],
        issues: dbStatus === "down" ? [{ id: "db_err", service: "database", title: "Falha na Base de Dados", detail: "A query de teste falhou ao conectar ao Neon." }] : []
      };

      return res.status(200).json(healthData);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro interno ao processar diagnóstico" });
    }
  }
}
import { Request, Response } from "express";
import { prismaClient } from "../lib/prisma"; // Ajuste o caminho se o seu client exportar apenas "prisma"

export class SchoolController {
  static async create(req: Request, res: Response) {
    try {
      const { nome, municipio, rede, status } = req.body;
      
      const escola = await prismaClient.escola.create({
        data: {
          nome,
          municipio,
          rede,
          status: status || "Pendente"
        }
      });
      
      return res.status(201).json(escola);
    } catch (error) {
      console.error("Erro ao criar escola:", error);
      return res.status(500).json({ error: "Erro interno ao criar a escola." });
    }
  }

  static async index(req: Request, res: Response) {
    try {
      const escolas = await prismaClient.escola.findMany({
        include: { users: true } // Retorna os gestores vinculados
      });
      
      return res.json(escolas);
    } catch (error) {
      console.error("Erro ao buscar escolas:", error);
      return res.status(500).json({ error: "Erro interno ao listar as escolas." });
    }
  }
}
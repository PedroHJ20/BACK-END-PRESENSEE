import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js'; // Note a extensão .js aqui também

export const ClassController = {
  async create(req: Request, res: Response) {
    try {
      const { name, year, course, shift } = req.body;
      const newClass = await prisma.class.create({ data: { name, year, course, shift } });
      res.status(201).json(newClass);
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar turma." });
    }
  },

  async index(req: Request, res: Response) {
    try {
      const classes = await prisma.class.findMany();
      res.json(classes);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar as turmas." });
    }
  }
};
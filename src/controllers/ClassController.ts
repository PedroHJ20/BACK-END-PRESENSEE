import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = (process.env.JWT_SECRET as string) || "fallback_secret";

// Função auxiliar para descobrir quem está fazendo a requisição
async function getLoggedUser(req: Request) {
  let userId = null;
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        userId = decoded.id;
      } catch (e) {
        // Ignora erro de decodificação no helper
      }
    }
  }

  if (!userId) {
    userId = (req as any).userId || (req as any).user?.id || (req as any).usuarioId;
  }

  if (userId) {
    return await prisma.user.findUnique({ where: { id: userId } });
  }
  return null;
}

export const ClassController = {
  async create(req: Request, res: Response) {
    try {
      const { name, year, course, shift } = req.body;
      
      const user = await getLoggedUser(req);
      let escolaId = req.body.escolaId; 

      // Se for gestor, a turma pertence obrigatoriamente à escola dele
      if (user && user.role !== 'ADMIN') {
        escolaId = user.escolaId;
      }

      const newClass = await prisma.class.create({ 
        data: { 
          name, 
          year, 
          course, 
          shift,
          escolaId // <-- Vincula a turma à escola no banco de dados
        } 
      });
      
      res.status(201).json(newClass);
    } catch (error) {
      console.error("Erro ao criar turma:", error);
      res.status(500).json({ error: "Erro ao criar turma." });
    }
  },

  async index(req: Request, res: Response) {
    try {
      const user = await getLoggedUser(req);
      let filtroEscola = {};

      // Regra Multi-Tenant (Isolamento por Escola)
      if (user && user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]); // Se o gestor não tem escola, retorna array vazio
        }
        filtroEscola = { escolaId: user.escolaId };
      }

      const classes = await prisma.class.findMany({
        where: filtroEscola, // <-- Aplica o filtro na busca
        include: {
          _count: {
            select: { students: true }
          },
          students: {
            include: {
              attendances: true,
              alerts: { where: { status: 'PENDING' } }
            }
          }
        }
      });

      // Mapeia os dados calculando os riscos internos da turma
      const formattedClasses = classes.map(c => {
        let highRisk = 0;
        let mediumRisk = 0;
        let totalPresent = 0;
        let totalAttendances = 0;

        c.students.forEach(student => {
          const total = student.attendances.length;
          const present = student.attendances.filter(a => a.status === 'PRESENT').length;
          totalAttendances += total;
          totalPresent += present;

          const freq = total > 0 ? (present / total) * 100 : 100;
          if (freq < 70 || student.alerts.length >= 2) {
            highRisk++;
          } else if (freq < 85 || student.alerts.length === 1) {
            mediumRisk++;
          }
        });

        const attendanceRate = totalAttendances > 0 
          ? Math.round((totalPresent / totalAttendances) * 100) 
          : 100;

        return {
          id: c.id,
          name: c.name,
          course: c.course,
          shift: c.shift,
          year: c.year,
          _count: { students: c._count.students },
          attendanceRate,
          attentionStudents: mediumRisk,
          highRiskStudents: highRisk
        };
      });

      res.json(formattedClasses);
    } catch (error) {
      console.error("Erro ao buscar turmas:", error);
      res.status(500).json({ error: "Erro ao buscar as turmas." });
    }
  }
};
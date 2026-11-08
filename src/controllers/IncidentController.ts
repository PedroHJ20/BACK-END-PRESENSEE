import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = (process.env.JWT_SECRET as string) || "fallback_secret";

// Função auxiliar de autenticação
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
        // Ignora erro
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

export class IncidentController {
  static async index(req: Request, res: Response) {
    try {
      const user = await getLoggedUser(req);
      const studentId = req.query.studentId as string | undefined;
      
      let baseFilter: any = {};

      // Filtro Multi-Tenant
      if (user && user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]); // Gestor sem escola não vê ocorrências
        }
        
        // Garante que só vê incidentes de alunos que pertencem à sua escola
        baseFilter = {
          student: {
            escolaId: user.escolaId
          }
        };
      }

      // Se um studentId específico foi requisitado (ex: Perfil do Aluno)
      if (studentId) {
        baseFilter.studentId = studentId;
      }

      const incidents = await prisma.incident.findMany({
        where: baseFilter,
        include: {
          student: {
            include: { class: true }
          }
        },
        orderBy: { date: 'desc' }
      });
      return res.json(incidents);
    } catch (error) {
      console.error("Erro ao buscar incidentes:", error);
      return res.status(500).json({ error: 'Erro ao buscar intervenções.' });
    }
  }

  static async create(req: Request, res: Response) {
    const { type, description, texto, studentId, date, title, priority, category, isPending } = req.body;

    try {
      const user = await getLoggedUser(req);

      // Trava de segurança para Criação
      if (user && user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada não pode criar ocorrências." });
        }
        
        if (studentId) {
          const student = await prisma.student.findUnique({ where: { id: studentId } });
          if (!student || student.escolaId !== user.escolaId) {
            return res.status(403).json({ error: "Este aluno não pertence à sua escola." });
          }
        }
      }

      let finalType = type;
      if (!finalType) {
          finalType = isPending ? 'PENDENCIA' : 'NOTA';
      }

      let descFinal = description || texto || '';
      
      if (title && !descFinal.includes(title)) descFinal = `[${title}] ${descFinal}`;
      if (category && !descFinal.includes(category)) descFinal = `[${category}] ${descFinal}`;
      if (priority && !descFinal.includes(priority)) descFinal = `[Prioridade: ${priority}] ${descFinal}`;

      const payloadData: any = {
        type: finalType,
        description: descFinal.trim() || 'Sem descrição',
      };

      if (studentId) payloadData.studentId = studentId;
      if (date) payloadData.date = new Date(date);

      const queryOptions: any = { data: payloadData };
      
      if (studentId) {
        queryOptions.include = {
          student: { include: { class: true } }
        };
      }

      const incident = await prisma.incident.create(queryOptions);
      return res.status(201).json(incident);
    } catch (error) {
      console.error("Erro Prisma ao salvar ocorrencia:", error);
      return res.status(500).json({ error: 'Erro ao registrar ocorrência.' });
    }
  }

  static async update(req: Request, res: Response) {
    const id = req.params.id as string;
    const { resolved, description, texto, feita } = req.body;
    
    try {
      const user = await getLoggedUser(req);

      // Trava de segurança para Edição
      if (user && user.role !== 'ADMIN') {
        const incidentExistente = await prisma.incident.findUnique({ 
          where: { id },
          include: { student: true }
        });
        
        if (!incidentExistente || (incidentExistente.student && incidentExistente.student.escolaId !== user.escolaId)) {
          return res.status(403).json({ error: "Sem permissão para editar esta ocorrência." });
        }
      }

      const updateData: any = {};
      
      const desc = description !== undefined ? description : texto;
      if (desc !== undefined) updateData.description = desc;
      
      const estadoResolvido = resolved !== undefined ? resolved : feita;
      if (estadoResolvido === true) updateData.type = 'RESOLVIDO';
      if (estadoResolvido === false) updateData.type = 'PENDENCIA';

      const incident = await prisma.incident.update({
        where: { id },
        data: updateData
      });
      return res.json(incident);
    } catch (error) {
      console.error("Erro ao atualizar incidente:", error);
      return res.status(500).json({ error: 'Erro ao atualizar registro.' });
    }
  }

  static async delete(req: Request, res: Response) {
    const id = req.params.id as string;
    
    try {
      const user = await getLoggedUser(req);

      // Trava de segurança para Exclusão
      if (user && user.role !== 'ADMIN') {
        const incidentExistente = await prisma.incident.findUnique({ 
          where: { id },
          include: { student: true }
        });
        
        if (!incidentExistente || (incidentExistente.student && incidentExistente.student.escolaId !== user.escolaId)) {
          return res.status(403).json({ error: "Sem permissão para excluir esta ocorrência." });
        }
      }

      await prisma.incident.delete({ where: { id } });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao deletar incidente:", error);
      return res.status(500).json({ error: 'Erro ao excluir registro.' });
    }
  }
}
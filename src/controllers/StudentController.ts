import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = (process.env.JWT_SECRET as string) || "fallback_secret";

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
        // Falha silenciosa no helper
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

export const StudentController = {
  // 1. Cadastrar um novo aluno (COM TRATAMENTO DE ERROS ROBUSTO)
  async create(req: Request, res: Response) {
    try {
      const { registration, name, email, birthDate } = req.body;
      
      // Mapeamento flexível para aceitar como o frontend envia a turma
      const classId = req.body.classId || req.body.turmaId || req.body.turma;

      if (!classId) {
        return res.status(400).json({ error: "A turma não foi identificada na requisição." });
      }

      const user = await getLoggedUser(req);
      let escolaId = req.body.escolaId;

      if (user && user.role !== 'ADMIN') {
        escolaId = user.escolaId;
        if (!escolaId) {
          return res.status(400).json({ error: "O gestor atual não tem uma escola vinculada." });
        }
      }

      // Se o email vier vazio (já que no front é opcional), gera um email fictício único
      const finalEmail = (email && email.trim() !== "") 
        ? email 
        : `${registration}@aluno.presensee.com`;

      // Previne falhas caso a data venha num formato inválido
      let parsedDate = null;
      if (birthDate) {
        const dateObj = new Date(birthDate);
        if (!isNaN(dateObj.getTime())) parsedDate = dateObj;
      }

      const newStudent = await prisma.student.create({
        data: {
          registration: String(registration),
          name: String(name),
          email: finalEmail,
          birthDate: parsedDate,
          classId: String(classId),
          escolaId
        }
      });
      
      return res.status(201).json(newStudent);
    } catch (error: any) {
      console.error("Erro detalhado ao criar aluno:", error);
      
      // Interceta o erro de campo único do Prisma (ex: Matrícula ou Email já existentes)
      if (error.code === 'P2002') {
         const campo = error.meta?.target || "desconhecido";
         return res.status(400).json({ error: `Já existe um registro com este dado: ${campo}` });
      }
      
      // Interceta o erro de Turma ou Escola inexistente (Chave Estrangeira)
      if (error.code === 'P2003') {
         return res.status(400).json({ error: "A turma selecionada não existe no banco de dados." });
      }

      return res.status(500).json({ error: "Erro interno ao cadastrar o aluno.", details: error.message });
    }
  },

  // 2. Listar todos os alunos com cálculo de Frequência e Risco (Filtrado por Escola)
  async index(req: Request, res: Response) {
    try {
      const user = await getLoggedUser(req);
      let filtroEscola = {};

      if (user && user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]); 
        }
        filtroEscola = { escolaId: user.escolaId };
      }

      const students = await prisma.student.findMany({
        where: filtroEscola,
        include: { 
          class: true,
          attendances: true 
        }
      });

      const studentsWithDashboardData = students.map(student => {
        const totalClasses = student.attendances.length;
        const presentClasses = student.attendances.filter(a => a.status === 'PRESENT').length;

        let frequency = 100;
        if (totalClasses > 0) {
          frequency = Math.round((presentClasses / totalClasses) * 100);
        }

        let risk = 'Baixo';
        if (frequency < 75) {
          risk = 'Alto';
        } else if (frequency <= 85) {
          risk = 'Médio';
        }

        const { attendances, ...studentData } = student;

        return {
          ...studentData,
          frequency,
          risk
        };
      });

      res.json(studentsWithDashboardData);
    } catch (error) {
      console.error("Erro ao listar alunos:", error);
      res.status(500).json({ error: "Erro ao buscar os alunos." });
    }
  },

  // 3. Buscar o perfil completo de um único aluno
  async show(req: Request, res: Response) {
    const id = req.params.id as string;
    
    try {
      const student = await prisma.student.findUnique({
        where: { id },
        include: {
          class: true,
          attendances: true,
          incidents: true,
          alerts: true,
          grades: true
        }
      });

      if (!student) {
        return res.status(404).json({ error: "Aluno não encontrado" });
      }
      
      return res.json(student);
    } catch (error) {
      console.error("Erro ao buscar perfil do aluno:", error);
      return res.status(500).json({ error: "Erro interno ao buscar aluno" });
    }
  },

  // 4. Cadastrar/Atualizar a foto biométrica do aluno
  async uploadBiometry(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem foi enviada." });
      }

      const imageUrl = req.file.path; 

      const student = await prisma.student.update({
        where: { id },
        data: { biometricDataUrl: imageUrl },
      });

      return res.json({ 
        message: "Biometria atualizada com sucesso na nuvem!",
        student 
      });
    } catch (error) {
      console.error("Erro detalhado no uploadBiometry:", JSON.stringify(error, null, 2));
      return res.status(500).json({ error: "Erro ao atualizar biometria." });
    }
  },

  // 5. Histórico detalhado para o Modal de Calendário
  async attendanceHistory(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const month = req.query.month as string | undefined;
      const year = req.query.year as string | undefined;

      let dateFilter = {};
      
      if (month && year) {
        const startDate = new Date(Number(year), Number(month) - 1, 1);
        const endDate = new Date(Number(year), Number(month), 1);
        
        dateFilter = {
          gte: startDate,
          lt: endDate
        };
      }

      const history = await prisma.attendance.findMany({
        where: {
          studentId: id,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        },
        orderBy: {
          date: 'asc'
        }
      });

      res.json(history);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
      res.status(500).json({ error: "Erro ao buscar o histórico de presença." });
    }
  }
};
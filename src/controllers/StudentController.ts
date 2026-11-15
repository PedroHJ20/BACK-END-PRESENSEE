import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const StudentController = {
  // 1. Cadastrar um novo aluno (MULTI-TENANT OTIMIZADO + DADOS DO RESPONSÁVEL)
  async create(req: Request, res: Response) {
    try {
      const {
        registration,
        name,
        email,
        birthDate,
        guardianName,
        guardianPhone,
        guardianRelationship,
        guardianEmail,
        phone,
        notes
      } = req.body;
      const classId = req.body.classId || req.body.turmaId || req.body.turma;

      if (!classId) {
        return res.status(400).json({ error: "A turma não foi selecionada." });
      }

      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let escolaId = req.body.escolaId;

      if (user.role !== 'ADMIN') {
        escolaId = user.escolaId;
        if (!escolaId) {
          return res.status(403).json({ error: "O gestor atual não tem uma escola vinculada." });
        }
      }

      const finalEmail = (email && email.trim() !== "")
        ? email.trim()
        : `${registration}@aluno.presensee.com`;

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

      if (guardianName || guardianPhone || guardianEmail || phone || notes) {
        const fichaCadastro = JSON.stringify({
          guardianName: guardianName?.trim() || "",
          guardianPhone: guardianPhone?.trim() || "",
          guardianRelationship: guardianRelationship?.trim() || "",
          guardianEmail: guardianEmail?.trim() || "",
          phone: phone?.trim() || "",
          notes: notes?.trim() || ""
        });

        await prisma.incident.create({
          data: {
            type: 'FICHA_CADASTRO',
            description: fichaCadastro,
            studentId: newStudent.id,
            escolaId
          }
        });
      }

      return res.status(201).json({
        ...newStudent,
        guardianName: guardianName?.trim() || "",
        guardianPhone: guardianPhone?.trim() || "",
        guardianRelationship: guardianRelationship?.trim() || "",
        guardianEmail: guardianEmail?.trim() || ""
      });
    } catch (error: any) {
      console.error("Erro detalhado ao criar aluno:", error);

      if (error.code === 'P2002') {
        const campo = error.meta?.target?.[0] || error.meta?.target || "desconhecido";
        const nomeCampo = campo === 'registration' ? 'matrícula' : campo === 'email' ? 'e-mail' : campo;
        return res.status(400).json({ error: `Já existe um aluno registrado com este(a) ${nomeCampo}.` });
      }

      if (error.code === 'P2003') {
        return res.status(400).json({ error: "A turma selecionada não existe no banco de dados." });
      }

      return res.status(500).json({ error: "Erro interno ao cadastrar o aluno.", details: error.message });
    }
  },

  // 2. Listar todos os alunos (Filtrado por Escola via req.user)
  async index(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let filtroEscola = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]);
        }
        filtroEscola = { escolaId: user.escolaId };
      }

      const students = await prisma.student.findMany({
        where: filtroEscola,
        orderBy: { name: 'asc' },
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

        return { ...studentData, frequency, risk };
      });

      return res.json(studentsWithDashboardData);
    } catch (error) {
      console.error("Erro ao listar alunos:", error);
      return res.status(500).json({ error: "Erro ao buscar os alunos." });
    }
  },

  // 3. Buscar perfil completo de um aluno
  async show(req: Request, res: Response) {
    const id = req.params.id as string;

    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

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

      if (user.role !== 'ADMIN' && student.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Acesso negado. Este aluno não pertence à sua escola." });
      }

      let dadosFicha: any = {};
      const fichaReg = student.incidents.find(i => i.type === 'FICHA_CADASTRO');
      if (fichaReg?.description) {
        try {
          dadosFicha = JSON.parse(fichaReg.description);
        } catch {
          dadosFicha = {};
        }
      }

      const incidentesVisiveis = student.incidents.filter(i => i.type !== 'FICHA_CADASTRO');

      return res.json({
        ...student,
        incidents: incidentesVisiveis,
        guardianName: dadosFicha.guardianName || "",
        guardianPhone: dadosFicha.guardianPhone || "",
        guardianRelationship: dadosFicha.guardianRelationship || "",
        guardianEmail: dadosFicha.guardianEmail || "",
        phone: dadosFicha.phone || "",
        notes: dadosFicha.notes || ""
      });
    } catch (error) {
      console.error("Erro ao buscar perfil do aluno:", error);
      return res.status(500).json({ error: "Erro interno ao buscar aluno" });
    }
  },

  // 4. Atualizar dados do aluno e ficha do responsável
  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const alunoAtual = await prisma.student.findUnique({
        where: { id },
        include: { incidents: { where: { type: 'FICHA_CADASTRO' } } }
      });

      if (!alunoAtual) {
        return res.status(404).json({ error: "Aluno não encontrado." });
      }

      if (user.role !== 'ADMIN' && alunoAtual.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Acesso negado a este aluno." });
      }

      const {
        registration,
        name,
        email,
        birthDate,
        guardianName,
        guardianPhone,
        guardianRelationship,
        guardianEmail,
        phone,
        notes
      } = req.body;

      const classId = req.body.classId || req.body.turmaId || req.body.turma;

      let parsedDate = alunoAtual.birthDate;
      if (birthDate !== undefined) {
        if (!birthDate) {
          parsedDate = null;
        } else {
          const dateObj = new Date(birthDate);
          if (!isNaN(dateObj.getTime())) parsedDate = dateObj;
        }
      }

      const updatedStudent = await prisma.student.update({
        where: { id },
        data: {
          ...(registration !== undefined && { registration: String(registration).trim() }),
          ...(name !== undefined && { name: String(name).trim() }),
          ...(email !== undefined && { email: String(email).trim() }),
          ...(classId !== undefined && { classId: String(classId) }),
          birthDate: parsedDate
        },
        include: { class: true }
      });

      const temCamposFicha = [
        guardianName,
        guardianPhone,
        guardianRelationship,
        guardianEmail,
        phone,
        notes
      ].some((v) => v !== undefined);

      if (temCamposFicha) {
        let fichaAnterior: any = {};
        const regFicha = alunoAtual.incidents[0];
        if (regFicha?.description) {
          try {
            fichaAnterior = JSON.parse(regFicha.description);
          } catch {
            fichaAnterior = {};
          }
        }

        const novaFicha = JSON.stringify({
          guardianName: guardianName !== undefined ? String(guardianName).trim() : (fichaAnterior.guardianName || ""),
          guardianPhone: guardianPhone !== undefined ? String(guardianPhone).trim() : (fichaAnterior.guardianPhone || ""),
          guardianRelationship: guardianRelationship !== undefined ? String(guardianRelationship).trim() : (fichaAnterior.guardianRelationship || ""),
          guardianEmail: guardianEmail !== undefined ? String(guardianEmail).trim() : (fichaAnterior.guardianEmail || ""),
          phone: phone !== undefined ? String(phone).trim() : (fichaAnterior.phone || ""),
          notes: notes !== undefined ? String(notes).trim() : (fichaAnterior.notes || "")
        });

        if (regFicha) {
          await prisma.incident.update({
            where: { id: regFicha.id },
            data: { description: novaFicha }
          });
        } else {
          await prisma.incident.create({
            data: {
              type: 'FICHA_CADASTRO',
              description: novaFicha,
              studentId: id,
              escolaId: alunoAtual.escolaId
            }
          });
        }
      }

      return res.json(updatedStudent);
    } catch (error: any) {
      console.error("Erro ao atualizar aluno:", error);
      if (error.code === 'P2002') {
        const campo = error.meta?.target?.[0] || error.meta?.target || "campo";
        return res.status(400).json({ error: `Já existe outro aluno com este(a) ${campo}.` });
      }
      return res.status(500).json({ error: "Erro ao atualizar aluno." });
    }
  },

  // 5. Excluir Aluno
  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const aluno = await prisma.student.findUnique({ where: { id } });
      if (!aluno) {
        return res.status(404).json({ error: "Aluno não encontrado." });
      }

      if (user.role !== 'ADMIN' && aluno.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Acesso negado a este aluno." });
      }

      await prisma.$transaction([
        prisma.attendance.deleteMany({ where: { studentId: id } }),
        prisma.incident.deleteMany({ where: { studentId: id } }),
        prisma.alert.deleteMany({ where: { studentId: id } }),
        prisma.grade.deleteMany({ where: { studentId: id } }),
        prisma.student.delete({ where: { id } })
      ]);

      return res.json({ message: "Aluno excluído com sucesso!" });
    } catch (error) {
      console.error("Erro ao excluir aluno:", error);
      return res.status(500).json({ error: "Erro ao excluir aluno." });
    }
  },

  // 6. Cadastrar/Atualizar foto biométrica
  async uploadBiometry(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      if (user.role !== 'ADMIN') {
        const student = await prisma.student.findUnique({ where: { id } });
        if (!student || student.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Sem permissão para alterar a biometria deste aluno." });
        }
      }

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
      console.error("Erro detalhado no uploadBiometry:", error);
      return res.status(500).json({ error: "Erro ao atualizar biometria." });
    }
  },

  // 7. Histórico detalhado para o Modal
  async attendanceHistory(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const month = req.query.month as string | undefined;
      const year = req.query.year as string | undefined;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      if (user.role !== 'ADMIN') {
        const studentCheck = await prisma.student.findUnique({ select: { escolaId: true }, where: { id } });
        if (!studentCheck || studentCheck.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Acesso negado. Aluno não pertence à sua escola." });
        }
      }

      let dateFilter = {};

      if (month && year) {
        const startDate = new Date(Number(year), Number(month) - 1, 1);
        const endDate = new Date(Number(year), Number(month), 1);
        dateFilter = { gte: startDate, lt: endDate };
      }

      const history = await prisma.attendance.findMany({
        where: {
          studentId: id,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        },
        orderBy: { date: 'asc' }
      });

      return res.json(history);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
      return res.status(500).json({ error: "Erro ao buscar o histórico de presença." });
    }
  }
};
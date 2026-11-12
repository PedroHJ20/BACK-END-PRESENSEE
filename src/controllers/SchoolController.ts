import type { Request, Response } from "express";
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export class SchoolController {
  static async create(req: Request, res: Response) {
    try {
      const user = req.user;
      
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Acesso negado. Apenas administradores podem cadastrar escolas." });
      }

      const { 
        nome, municipio, rede, status, 
        inep, cep, logradouro, numero, 
        complemento, bairro, uf, telefone,
        gestorNome, gestorEmail
      } = req.body;

      if (!nome || !gestorNome || !gestorEmail) {
        return res.status(400).json({ error: "É obrigatório informar o Nome da escola, além do Nome e E-mail do gestor responsável." });
      }

      const userExists = await prisma.user.findUnique({ where: { email: gestorEmail } });
      if (userExists) {
        return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
      }

      const senhaProvisoria = crypto.randomBytes(4).toString('hex');
      const hashedPassword = await bcrypt.hash(senhaProvisoria, 10);

      const novaEscola = await prisma.$transaction(async (tx) => {
        const escola = await tx.escola.create({
          data: {
            nome,
            municipio,
            rede,
            status: status || "Pendente",
            inep,
            cep,
            logradouro,
            numero,
            complemento,
            bairro,
            uf,
            telefone
          }
        });

        await tx.user.create({
          data: {
            name: gestorNome,
            email: gestorEmail,
            password: hashedPassword,
            role: "MANAGER",
            escolaId: escola.id,
            primeiroAcesso: true
          }
        });

        return escola;
      });

      const frontendUrl = process.env.FRONTEND_URL || 'https://presensee.vercel.app';

      transporter.sendMail({
        from: `"PresenSee" <${process.env.SMTP_USER}>`,
        to: gestorEmail,
        subject: `Bem-vindo ao PresenSee - Acesso da ${nome}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #4f46e5; margin-bottom: 16px;">Bem-vindo ao PresenSee!</h2>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Olá, <strong>${gestorNome}</strong>! A instituição <strong>${nome}</strong> foi cadastrada com sucesso na plataforma e você foi definido(a) como gestor(a) responsável.
            </p>
            <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 20px 0; border-radius: 6px;">
              <p style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px;"><strong>Login (E-mail):</strong> ${gestorEmail}</p>
              <p style="margin: 0; color: #1e293b; font-size: 14px;"><strong>Senha Provisória:</strong> <span style="font-family: monospace; font-size: 16px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${senhaProvisoria}</span></p>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">
              Por segurança, o sistema solicitará a troca desta senha provisória assim que você realizar o seu primeiro login.
            </p>
            <div style="margin-top: 24px;">
              <a href="${frontendUrl}/login" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">
                Acessar o Sistema
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              E-mail automático enviado pela equipe PresenSee. Não responda a esta mensagem.
            </p>
          </div>
        `
      }).catch(emailError => {
        console.error("Aviso: Falha ao despachar e-mail:", emailError);
      });

      console.log(`\n=========================================`);
      console.log(`🏫 NOVA ESCOLA CADASTRADA COM SUCESSO!`);
      console.log(`📧 Gestor: ${gestorEmail}`);
      console.log(`🔑 SENHA PROVISÓRIA: ${senhaProvisoria}`);
      console.log(`=========================================\n`);

      return res.status(201).json({ 
        message: "Escola e gestor criados com sucesso!", 
        escola: novaEscola 
      });
    } catch (error) {
      console.error("Erro ao criar escola:", error);
      return res.status(500).json({ error: "Erro interno ao criar a escola." });
    }
  }

  static async index(req: Request, res: Response) {
    try {
      const user = req.user;
      
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Acesso negado. Apenas administradores podem listar as escolas." });
      }

      const escolas = await prisma.escola.findMany({
        include: { users: true },
        orderBy: { createdAt: 'desc' }
      });
      return res.json(escolas);
    } catch (error) {
      console.error("Erro ao buscar escolas:", error);
      return res.status(500).json({ error: "Erro interno ao listar as escolas." });
    }
  }

  static async updateStatus(req: Request, res: Response) {
    try {
      const user = req.user;
      
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Acesso negado." });
      }

      const id = req.params.id as string;
      const { status } = req.body;
      const escola = await prisma.escola.update({
        where: { id },
        data: { status }
      });
      return res.json(escola);
    } catch (error) {
      console.error("Erro ao atualizar status da escola:", error);
      return res.status(500).json({ error: "Erro ao atualizar status." });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const user = req.user;
      
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Acesso negado." });
      }

      const id = req.params.id as string;

      await prisma.$transaction(async (tx) => {
        // 1. Remove registros operacionais vinculados à escola
        await tx.chamado.deleteMany({ where: { escolaId: id } });
        await tx.event.deleteMany({ where: { escolaId: id } });
        await tx.incident.deleteMany({ where: { escolaId: id } });
        await tx.attendance.deleteMany({ where: { student: { escolaId: id } } });
        await tx.student.deleteMany({ where: { escolaId: id } });
        await tx.class.deleteMany({ where: { escolaId: id } });

        // 2. Exclui o gestor e quaisquer usuários vinculados à escola
        await tx.user.deleteMany({ where: { escolaId: id } });

        // 3. Exclui a escola
        await tx.escola.delete({ where: { id } });
      });

      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir escola e gestor vinculado:", error);
      return res.status(500).json({ error: "Erro ao excluir escola e dados vinculados." });
    }
  }
}
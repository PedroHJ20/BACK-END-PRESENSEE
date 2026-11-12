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

      if (!gestorNome || !gestorEmail) {
        return res.status(400).json({ error: "É obrigatório informar o Nome e E-mail do gestor responsável." });
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
            nome, municipio, rede, status: status || "Pendente",
            inep, cep, logradouro, numero, complemento, bairro, uf, telefone
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

      transporter.sendMail({
        from: `"PresenSee" <${process.env.SMTP_USER}>`,
        to: gestorEmail,
        subject: "Bem-vindo ao PresenSee - Suas credenciais de acesso",
        html: `...` // (Mantenha o seu HTML intacto aqui na implementação real)
      }).catch(emailError => {
        console.error("Aviso: Falha ao despachar e-mail:", emailError);
      });

      console.log(`\n=========================================`);
      console.log(`🏫 NOVA ESCOLA CADASTRADA COM SUCESSO!`);
      console.log(`📧 Gestor: ${gestorEmail}`);
      console.log(`🔑 SENHA PROVISÓRIA: ${senhaProvisoria}`);
      console.log(`=========================================\n`);

      return res.status(201).json({ message: "Escola e gestor criados com sucesso!", escola: novaEscola });
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
        include: { users: true } 
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
      await prisma.escola.delete({ 
        where: { id } 
      });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir escola:", error);
      return res.status(500).json({ error: "Erro ao excluir escola." });
    }
  }
}
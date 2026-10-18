import { Router } from 'express';
import { ClassController } from '../controllers/ClassController.js';
import { StudentController } from '../controllers/StudentController.js';
import { AttendanceController } from '../controllers/AttendanceController.js';
import { AuthController } from '../controllers/AuthController.js';
import { EventController } from '../controllers/EventController.js';
import { IncidentController } from '../controllers/IncidentController.js';
import { DashboardController } from '../controllers/DashboardController.js';
import { upload } from '../middlewares/upload.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const routes = Router();

// ==========================================
// ZONA PÚBLICA (Qualquer um pode acessar)
// ==========================================
routes.get('/api/status', (req, res) => {
  res.json({ message: "O backend do PresenSee está vivo e estruturado!" });
});

routes.post('/api/login', AuthController.login);
routes.post('/api/setup', AuthController.setup); // Rota para recriar o admin se necessário

// ==========================================
// CATRACA ELETRÔNICA
// ==========================================
// A partir desta linha, TODAS as rotas exigem o Token JWT no cabeçalho
routes.use(authMiddleware);

// ==========================================
// ZONA PROTEGIDA (Acesso restrito)
// ==========================================

// Dashboard (Home e Relatórios)
routes.get('/api/dashboard', DashboardController.getSummary);

// Turmas
routes.post('/api/classes', ClassController.create);
routes.get('/api/classes', ClassController.index);

// Alunos e Histórico
routes.post('/api/students', StudentController.create);
routes.get('/api/students', StudentController.index); 
routes.patch('/api/students/:id/biometry', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error("Erro real do Cloudinary/Multer:", err);
      return res.status(500).json({ error: "Falha na nuvem", detalhes: err.message || err });
    }
    next();
  });
}, StudentController.uploadBiometry);
routes.get('/api/students/:id/attendance-history', StudentController.attendanceHistory); 

// Frequência e Alertas
routes.post('/api/attendances', AttendanceController.create);
routes.get('/api/alerts', AttendanceController.listAlerts);

// ==========================================
// DIÁRIO DO MONITOR E INTERVENÇÕES
// ==========================================
routes.get('/api/incidents', IncidentController.index);
routes.post('/api/incidents', IncidentController.create);

// ==========================================
// CALENDÁRIO ESCOLAR (Eventos)
// ==========================================
routes.get('/api/events', EventController.index);
routes.post('/api/events', EventController.create);
routes.delete('/api/events/:id', EventController.delete);

export default routes;
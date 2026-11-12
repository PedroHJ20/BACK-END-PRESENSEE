import { Router } from 'express';
import { ClassController } from '../controllers/ClassController.js';
import { StudentController } from '../controllers/StudentController.js';
import { AttendanceController } from '../controllers/AttendanceController.js';
import { AuthController } from '../controllers/AuthController.js';
import { EventController } from '../controllers/EventController.js';
import { IncidentController } from '../controllers/IncidentController.js';
import { DashboardController } from '../controllers/DashboardController.js';
import { SchoolController } from '../controllers/SchoolController.js';
import { UserController } from '../controllers/UserController.js';
import { ChamadoController } from '../controllers/ChamadoController.js';
import { ComunicadoController } from '../controllers/ComunicadoController.js';
import { HealthController } from '../controllers/HealthController.js';
import { AuditoriaController } from '../controllers/AuditoriaController.js';
import { upload } from '../middlewares/upload.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const routes = Router();

// Rotas Públicas
routes.get('/api/status', (req, res) => {
  res.json({ message: "O backend do PresenSee está ativo!" });
});
routes.post('/api/login', AuthController.login);
routes.post('/api/setup', AuthController.setup); 
routes.post('/api/change-initial-password', AuthController.changeInitialPassword);

// Middleware de Autenticação (Requer Token JWT)
routes.use(authMiddleware);

// Rotas Protegidas

// Dashboard
routes.get('/api/dashboard', DashboardController.getSummary);

// Escolas (Admin)
routes.post('/api/escolas', SchoolController.create);
routes.get('/api/escolas', SchoolController.index);
routes.patch('/api/escolas/:id/status', SchoolController.updateStatus);
routes.delete('/api/escolas/:id', SchoolController.delete);

// Usuários / Gestores
routes.post('/api/users', UserController.create);
routes.get('/api/users', UserController.index);
routes.patch('/api/users/:id', UserController.update);
routes.patch('/api/users/:id/avatar', upload.single('photo'), UserController.uploadAvatar);
routes.delete('/api/users/:id', UserController.delete);

// Chamados de Suporte
routes.get('/api/chamados', ChamadoController.index);
routes.post('/api/chamados', ChamadoController.create);
routes.patch('/api/chamados/:id', ChamadoController.update);

// Comunicados
routes.get('/api/comunicados', ComunicadoController.index);
routes.post('/api/comunicados', ComunicadoController.create);
routes.patch('/api/comunicados/:id', ComunicadoController.update);
routes.delete('/api/comunicados/:id', ComunicadoController.delete);

// Saúde do Sistema (Admin)
routes.get('/api/health', HealthController.check);

// Auditoria (Admin)
routes.get('/api/auditoria', AuditoriaController.index);
routes.post('/api/auditoria', AuditoriaController.create);

// Turmas
routes.post('/api/classes', ClassController.create);
routes.get('/api/classes', ClassController.index);

// Alunos
routes.post('/api/students', StudentController.create);
routes.get('/api/students', StudentController.index); 
routes.get('/api/students/:id', StudentController.show); 
routes.patch('/api/students/:id/biometry', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error("Erro no upload:", err);
      return res.status(500).json({ error: "Falha no upload", detalhes: err.message || err });
    }
    next();
  });
}, StudentController.uploadBiometry);
routes.get('/api/students/:id/attendance-history', StudentController.attendanceHistory); 

// Frequência e Alertas
routes.post('/api/attendances', AttendanceController.create);
routes.get('/api/alerts', AttendanceController.listAlerts);

// Ocorrências (Diário do Monitor e Intervenções)
routes.get('/api/incidents', IncidentController.index);
routes.post('/api/incidents', IncidentController.create);
routes.patch('/api/incidents/:id', IncidentController.update);
routes.delete('/api/incidents/:id', IncidentController.delete);

// Eventos (Calendário Escolar)
routes.get('/api/events', EventController.index);
routes.post('/api/events', EventController.create);
routes.patch('/api/events/:id', EventController.update);
routes.delete('/api/events/:id', EventController.delete);

export default routes;
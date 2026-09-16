import { Router } from 'express';
import { ClassController } from '../controllers/ClassController.js';
import { StudentController } from '../controllers/StudentController.js';
import { AttendanceController } from '../controllers/AttendanceController.js';
import { upload } from '../middlewares/upload.js';

const routes = Router();

// Rota de Teste
routes.get('/api/status', (req, res) => {
  res.json({ message: "O backend do PresenSee está vivo e estruturado!" });
});

// Turmas
routes.post('/api/classes', ClassController.create);
routes.get('/api/classes', ClassController.index);

// Alunos e Histórico
routes.post('/api/students', StudentController.create);
routes.get('/api/students', StudentController.index); // Dashboard
routes.patch('/api/students/:id/biometry', upload.single('photo'), StudentController.uploadBiometry);
routes.get('/api/students/:id/attendance-history', StudentController.attendanceHistory); // Calendário

// Frequência e Alertas
routes.post('/api/attendances', AttendanceController.create);
routes.get('/api/alerts', AttendanceController.listAlerts);

export default routes;
// dotenv carga las variables definidas en backend/.env.
import "dotenv/config";

// Dependencias externas: servidor HTTP, CORS y cliente de Prisma.
import cors from "cors";
import express from "express";
import { PrismaClient } from "@prisma/client";

// Codigo propio del proyecto.
import { initDatabase } from "./initDb";

// -----------------------------------------------------------------------------
// 1. Configuracion inicial
// -----------------------------------------------------------------------------

const app = express();
const port = Number(process.env.PORT ?? 3000);
const prisma = new PrismaClient();

// CORS permite que Expo se conecte a la API desde otro origen.
// express.json() transforma el body JSON en req.body.
app.use(cors());
app.use(express.json());

// Convierte el parametro :id de la URL a un numero seguro para Prisma.
function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Convierte una fecha recibida como texto y evita guardar fechas invalidas.
function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// -----------------------------------------------------------------------------
// 2. Rutas de la API REST
// -----------------------------------------------------------------------------

// GET /api/health
// Ruta de prueba: confirma que Express esta encendido.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// GET /api/personas
// Devuelve todas las personas para que FlatList pueda mostrarlas.
app.get("/api/personas", async (_req, res) => {
  const people = await prisma.person.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.json(people);
});

// POST /api/personas
// Recibe una persona nueva y la guarda mediante Prisma.
app.post("/api/personas", async (req, res) => {
  const { firstName, lastName, arrivalDate, isWorking } = req.body;

  // Nombre y apellido son obligatorios para crear el registro.
  if (!String(firstName ?? '').trim() || !String(lastName ?? '').trim()) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  // Si no llega fecha, usamos la fecha actual del servidor.
  const parsedArrivalDate = arrivalDate ? parseDate(arrivalDate) : new Date();
  if (!parsedArrivalDate) {
    return res.status(400).json({ error: "La fecha de llegada no es valida" });
  }

  const person = await prisma.person.create({
    data: {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      arrivalDate: parsedArrivalDate,
      isWorking: Boolean(isWorking),
    },
  });

  // 201 indica que se creo un recurso nuevo.
  res.status(201).json(person);
});

// PATCH /api/personas/:id
// Actualiza solamente los campos enviados, por ejemplo isWorking.
app.patch("/api/personas/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const { firstName, lastName, arrivalDate, isWorking } = req.body;
  const data: {
    firstName?: string;
    lastName?: string;
    arrivalDate?: Date | null;
    isWorking?: boolean;
  } = {};

  // Solo agregamos al update los campos realmente recibidos.
  if (firstName !== undefined) data.firstName = String(firstName).trim();
  if (lastName !== undefined) data.lastName = String(lastName).trim();
  if (arrivalDate !== undefined) {
    if (arrivalDate === null) {
      data.arrivalDate = null;
    } else {
      const parsedArrivalDate = parseDate(String(arrivalDate));
      if (!parsedArrivalDate) {
        return res.status(400).json({ error: "La fecha de llegada no es valida" });
      }
      data.arrivalDate = parsedArrivalDate;
    }
  }
  if (isWorking !== undefined) data.isWorking = Boolean(isWorking);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const person = await prisma.person.update({
    where: { id },
    data,
  });

  res.json(person);
});

// -----------------------------------------------------------------------------
// 3. Arranque del servidor
// -----------------------------------------------------------------------------

async function start() {
  // Primero aseguramos que SQLite tenga la tabla y columnas necesarias.
  await initDatabase();

  // Cuando esta linea se ejecuta, Express ya puede recibir peticiones.
  app.listen(port, () => {
    console.log(`API escuchando en http://localhost:${port}`);
  });
}

// Si la base no puede prepararse, mostramos el error y cerramos el proceso.
start().catch((error) => {
  console.error("No se pudo iniciar la API", error);
  process.exit(1);
});

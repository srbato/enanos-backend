import "dotenv/config";
import path from "node:path";
import sqlite3 from "sqlite3";

// __dirname apunta a backend/src en desarrollo y a backend/dist al compilar.
// En ambos casos ../prisma/dev.db termina en la misma base SQLite.
const databasePath = path.resolve(__dirname, "../prisma/dev.db");

// -----------------------------------------------------------------------------
// Funciones auxiliares para preparar y actualizar SQLite
// -----------------------------------------------------------------------------

// Agrega una columna solamente si la tabla Person todavia no la tiene.
// Esto permite reutilizar una base creada con una version anterior del proyecto.
function addColumnIfNeeded(
  db: sqlite3.Database,
  columnName: string,
  columnDefinition: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info("Person")`, (error, rows: { name: string }[]) => {
      if (error) {
        reject(error);
        return;
      }

      const columnExists = rows.some((column) => column.name === columnName);
      if (columnExists) {
        resolve();
        return;
      }

      db.run(
        `ALTER TABLE "Person" ADD COLUMN "${columnName}" ${columnDefinition}`,
        (alterError) => {
          if (alterError) reject(alterError);
          else resolve();
        },
      );
    });
  });
}

// -----------------------------------------------------------------------------
// Inicializacion de la base
// -----------------------------------------------------------------------------

export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Abrimos el archivo local. Si no existe, sqlite3 lo crea.
    const db = new sqlite3.Database(databasePath);

    // Primera instalacion: crea la tabla Person con todos los campos actuales.
    db.run(
      `CREATE TABLE IF NOT EXISTS "Person" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        "age" INTEGER,
        "arrivalDate" DATETIME,
        "isWorking" BOOLEAN NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      async (personError) => {
        if (personError) {
          db.close();
          reject(personError);
          return;
        }

        try {
          // Migracion simple para bases que solo tenian nombre y apellido.
          await addColumnIfNeeded(db, "arrivalDate", "DATETIME");
          await addColumnIfNeeded(db, "isWorking", "BOOLEAN NOT NULL DEFAULT 0");
          await addColumnIfNeeded(db, "age", "INTEGER")

          // Prisma espera un DateTime completo. Normalizamos fechas antiguas.
          db.run(
            `UPDATE "Person"
             SET "arrivalDate" = datetime('now')
             WHERE "arrivalDate" IS NULL OR length("arrivalDate") = 10`,
            (updateError) => {
              if (updateError) {
                db.close();
                reject(updateError);
                return;
              }

              // Solo sembramos enanos de ejemplo si la tabla esta vacia.
              // Estos nombres siguen la ambientacion de Dwarf Fortress.
              db.get(
                `SELECT COUNT(*) AS count FROM "Person"`,
                (_countError, row: { count: number }) => {
                  if (row?.count !== 0) {
                    db.close();
                    resolve();
                    return;
                  }

                  db.run(
                    `INSERT INTO "Person" ("firstName", "lastName", "arrivalDate", "isWorking") VALUES
                      ('Urist', 'McDwarf', '2026-09-15', 1),
                      ('Mafol', 'Craftsdwarf', '2026-09-14', 1),
                      ('Domas', 'Stoneworker', '2026-09-13', 0)`,
                    (seedError) => {
                      db.close();
                      if (seedError) reject(seedError);
                      else resolve();
                    },
                  );
                },
              );
            },
          );
        } catch (error) {
          db.close();
          reject(error);
        }
      },
    );
  });
}

// Permite ejecutar este archivo directamente con npm run db:init.
if (require.main === module) {
  initDatabase()
    .then(() => console.log("Base de datos lista"))
    .catch((error) => {
      console.error("No se pudo preparar la base de datos", error);
      process.exit(1);
    });
}

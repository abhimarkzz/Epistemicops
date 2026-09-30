"""
Verifies Neon PostgreSQL pgvector schema for Hindsight v0.10.1 compatibility.
Checks that embedding dimensions match 384 for ONNX multilingual-e5-small.
"""
import os
import sys

def check_database_schema(db_url: str, required_dim: int = 384) -> bool:
    if not db_url:
        print("[HINDSIGHT][DB] No external DATABASE_URL configured; using local pg0.")
        return True
    
    try:
        import psycopg2
    except ImportError:
        print("[HINDSIGHT][DB] psycopg2 not available to verify schema; continuing.")
        return True

    try:
        conn = psycopg2.connect(db_url, connect_timeout=10)
        conn.autocommit = True
        with conn.cursor() as cur:
            # Check if pgvector extension is present
            cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
            if not cur.fetchone():
                print("[HINDSIGHT][DB] Creating 'vector' extension in Neon PostgreSQL...")
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")

            # Check if memory_units table exists
            cur.execute("""
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'memory_units'
            """)
            if not cur.fetchone():
                print("[HINDSIGHT][DB] Table 'memory_units' does not exist yet. Fresh database ready for 384-dim schema.")
                conn.close()
                return True

            # Check existing embedding column dimension
            cur.execute("""
                SELECT atttypmod
                FROM pg_attribute
                WHERE attrelid = 'public.memory_units'::regclass
                  AND attname = 'embedding'
            """)
            row = cur.fetchone()
            if not row or row[0] is None:
                print("[HINDSIGHT][DB] Column 'embedding' not found on memory_units.")
                conn.close()
                return True

            current_dim = row[0]
            print(f"[HINDSIGHT][DB] Existing database embedding dimension: {current_dim} (required: {required_dim})")
            if current_dim == required_dim:
                print(f"[HINDSIGHT][DB] Schema matches {required_dim} dimensions. Ready.")
                conn.close()
                return True

            # Dimension mismatch detected
            cur.execute("SELECT COUNT(*) FROM public.memory_units WHERE embedding IS NOT NULL")
            count = cur.fetchone()[0]
            print(f"[HINDSIGHT][DB][WARNING] Dimension mismatch: database has vector({current_dim}) with {count} rows, model requires vector({required_dim}).")
            
            allow_reset = os.getenv("HINDSIGHT_RESET_ON_DIMENSION_MISMATCH", "true").lower() in ("true", "1", "yes")
            if allow_reset:
                print(f"[HINDSIGHT][DB] Resetting {count} incompatible {current_dim}-dim memories to allow {required_dim}-dim ONNX migration...")
                cur.execute("DELETE FROM public.memory_units;")
                cur.execute("""
                    DO $$
                    DECLARE
                        r RECORD;
                    BEGIN
                        FOR r IN (SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'memory_units' AND indexdef LIKE '%embedding%') LOOP
                            EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.indexname);
                        END LOOP;
                    END $$;
                """)
                cur.execute(f"ALTER TABLE public.memory_units ALTER COLUMN embedding TYPE vector({required_dim});")
                print(f"[HINDSIGHT][DB] Successfully updated memory_units schema to vector({required_dim}).")
            else:
                print("[HINDSIGHT][DB][ERROR] Incompatible dimensions and HINDSIGHT_RESET_ON_DIMENSION_MISMATCH is false.")
                print("To fix: run 'DELETE FROM public.memory_units;' in Neon SQL Editor or set HINDSIGHT_RESET_ON_DIMENSION_MISMATCH=true.")
                conn.close()
                return False

        conn.close()
        return True
    except Exception as e:
        print(f"[HINDSIGHT][DB][WARNING] Error verifying schema: {e}. Hindsight will attempt its own startup migrations.")
        return True

if __name__ == "__main__":
    db = os.getenv("HINDSIGHT_API_DATABASE_URL") or os.getenv("DATABASE_URL") or ""
    dim = int(os.getenv("HINDSIGHT_API_EMBEDDINGS_ONNX_DIMENSIONS", "384"))
    ok = check_database_schema(db, dim)
    if not ok:
        sys.exit(1)

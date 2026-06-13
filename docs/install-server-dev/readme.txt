===========================================================================
 IT Service V2 — คู่มือ Install สำหรับ Server Dev (เครื่อง developer)
===========================================================================

สแต็กของโปรเจกต์:
  - Backend : Laravel 12 (PHP 8.2+)
  - Frontend: React 19 + Vite + TailwindCSS 4
  - Auth    : Laravel Sanctum (SPA / cookie + session)
  - Database: MariaDB (utf8mb4)

ไฟล์ในโฟลเดอร์นี้:
  - install-dev.sh : สคริปต์ติดตั้งอัตโนมัติ (รันซ้ำได้ ปลอดภัย)
  - readme.txt     : ไฟล์นี้ — วิธีใช้ + การแก้ปัญหาเบื้องต้น


===========================================================================
 1) สิ่งที่ต้องมีก่อน (Prerequisites)
===========================================================================

ติดตั้งผ่าน Homebrew (macOS):
    brew install php composer node mariadb

ตรวจเวอร์ชัน:
    php -v          # ต้อง >= 8.2
    composer -V
    node -v         # แนะนำ >= 20
    mariadb --version

หมายเหตุ: โปรเจกต์รองรับ PHP 8.2 ขึ้นไป และทดสอบบน PHP 8.5 แล้ว


===========================================================================
 2) วิธีติดตั้งแบบอัตโนมัติ (แนะนำ)
===========================================================================

จาก root ของโปรเจกต์ รัน:

    bash docs/install-server-dev/install-dev.sh --seed

ตัวเลือก (options):
    --seed         ใส่ข้อมูลตัวอย่าง + บัญชีทดลอง (demo accounts)
    --fresh        ล้างตารางทั้งหมดแล้ว migrate ใหม่ (ระวัง! ลบข้อมูล)
    --no-npm       ข้าม npm install
    --no-composer  ข้าม composer install
    --help         แสดงวิธีใช้

เปลี่ยนค่า database ได้ด้วย env var (ถ้าไม่อยากใช้ค่า default):
    DB_NAME=mydb DB_USER=me DB_PASS=secret \
      bash docs/install-server-dev/install-dev.sh --seed

ค่า default ที่สคริปต์ตั้งให้:
    database = itservices
    user     = itservices
    password = itservices
    host     = 127.0.0.1 : 3306


สคริปต์ทำอะไรให้บ้าง (ตามลำดับ):
    1. เช็ค php / composer / node / mariadb
    2. สตาร์ท MariaDB ถ้ายังไม่รัน
    3. สร้าง database + user (utf8mb4) และตรวจว่า login ผ่าน TCP ได้
    4. สร้าง/อัปเดต .env  (DB_* + SANCTUM_STATEFUL_DOMAINS)
    5. composer install
    6. npm install
    7. สร้าง APP_KEY (ถ้ายังว่าง)
    8. php artisan migrate  (+ db:seed ถ้าใส่ --seed)
    9. php artisan storage:link + config:clear


===========================================================================
 3) เริ่มใช้งาน (รัน dev server)
===========================================================================

    composer run dev

คำสั่งนี้รัน 3 อย่างพร้อมกัน:
    - php artisan serve       (http://localhost:8000)
    - php artisan queue:listen
    - npm run dev             (Vite asset server / HMR, port 5173)

** เปิดเว็บที่ http://localhost:8000  (ไม่ใช่ port 5173 ของ Vite) **


บัญชีทดลอง (ต้องรันด้วย --seed) — รหัสผ่านทุกบัญชีคือ  password
    super   = Super Admin
    it      = IT Admin
    hr      = HR
    user    = Staff ทั่วไป


===========================================================================
 4) ติดตั้งแบบ Manual (ถ้าสคริปต์มีปัญหา)
===========================================================================

    # 4.1 สร้าง DB + user (เข้า mariadb ในฐานะ admin)
    mariadb              # หรือ: sudo mariadb -uroot
    > CREATE DATABASE itservices CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    > CREATE USER 'itservices'@'127.0.0.1' IDENTIFIED BY 'itservices';
    > CREATE USER 'itservices'@'localhost' IDENTIFIED BY 'itservices';
    > GRANT ALL PRIVILEGES ON itservices.* TO 'itservices'@'127.0.0.1';
    > GRANT ALL PRIVILEGES ON itservices.* TO 'itservices'@'localhost';
    > FLUSH PRIVILEGES;
    > EXIT;

    # 4.2 .env
    cp .env.example .env
    # แก้ใน .env:
    #   DB_CONNECTION=mariadb
    #   DB_HOST=127.0.0.1
    #   DB_PORT=3306
    #   DB_DATABASE=itservices
    #   DB_USERNAME=itservices
    #   DB_PASSWORD=itservices
    #   SANCTUM_STATEFUL_DOMAINS=localhost,localhost:8000,localhost:5173,127.0.0.1,127.0.0.1:8000,127.0.0.1:5173,::1

    # 4.3 dependencies + setup
    composer install
    npm install
    php artisan key:generate
    php artisan migrate --seed
    php artisan storage:link
    php artisan config:clear


===========================================================================
 5) การแก้ปัญหาเบื้องต้น (Troubleshooting)
===========================================================================

---------------------------------------------------------------------------
[A] Login ไม่ได้ / กด login แล้วเด้งกลับ / error 500
    "Session store not set on request"
---------------------------------------------------------------------------
สาเหตุ: host ที่เปิดเว็บ ไม่อยู่ใน Sanctum stateful domains
        (เช่น เปิด http://localhost:8000 แต่ list มีแค่ 127.0.0.1:8000)
        Sanctum เลยไม่แนบ session cookie → login ไม่ติด

แก้:
    1. ตรวจว่าใน .env มีบรรทัดนี้ (ครอบคลุมทั้ง localhost และ 127.0.0.1):
       SANCTUM_STATEFUL_DOMAINS=localhost,localhost:8000,localhost:5173,127.0.0.1,127.0.0.1:8000,127.0.0.1:5173,::1
    2. php artisan config:clear
    3. Hard reload หน้าเว็บ (ล้าง cookie XSRF-TOKEN เก่า)

ทางลัดชั่วคราว: เปิดผ่าน http://127.0.0.1:8000 (อยู่ใน default list อยู่แล้ว)

---------------------------------------------------------------------------
[B] APP_KEY ว่าง / error "No application encryption key has been specified"
---------------------------------------------------------------------------
แก้:
    php artisan key:generate
    php artisan config:clear

---------------------------------------------------------------------------
[C] ต่อ database ไม่ได้
    "SQLSTATE[HY000] [1045] Access denied" หรือ "[2002] Connection refused"
---------------------------------------------------------------------------
เช็คทีละข้อ:
    - MariaDB รันอยู่ไหม:   mariadb-admin ping
      ถ้าไม่รัน:            brew services start mariadb
    - ต่อด้วย user แอปได้ไหม (สำคัญ! ต้องเป็น TCP):
          mariadb -h127.0.0.1 -P3306 -uitservices -pitservices itservices -e "SELECT 1;"
    - ค่าใน .env (DB_HOST/PORT/DATABASE/USERNAME/PASSWORD) ตรงกับที่สร้างไว้ไหม
    - หลังแก้ .env เสมอ:    php artisan config:clear

หมายเหตุ: การ login เข้า mariadb จาก terminal ได้ ไม่ได้แปลว่า Laravel จะต่อได้
          เพราะ terminal ใช้ unix_socket (ในฐานะ user เครื่อง) แต่ Laravel ต่อผ่าน
          TCP + password ต้องมี user ที่มีรหัสผ่านจริง (ตามขั้นตอนข้อ 4.1)

---------------------------------------------------------------------------
[D] brew services start mariadb แล้วขึ้น error / exited with 5
---------------------------------------------------------------------------
มักเป็นเพราะ service โหลดอยู่แล้ว ตรวจว่าจริง ๆ รันอยู่ไหม:
    mariadb-admin ping        # ถ้าได้ "mysqld is alive" = รันอยู่แล้ว ไม่ต้องสนใจ error

ถ้าอยากรีเซ็ต service:
    brew services stop mariadb
    brew services start mariadb

ดู log ถ้ายังไม่ขึ้น:
    cat $(brew --prefix)/var/mysql/*.err

---------------------------------------------------------------------------
[E] PHP Deprecated: Constant PDO::MYSQL_ATTR_SSL_CA is deprecated (PHP 8.5)
---------------------------------------------------------------------------
เป็นแค่ warning ไม่ทำให้พัง โปรเจกต์นี้แก้ไว้แล้วใน config/database.php
(เลือกค่าคงที่ตามเวอร์ชัน PHP อัตโนมัติ: Pdo\Mysql::ATTR_SSL_CA บน 8.5,
fallback เป็น PDO::MYSQL_ATTR_SSL_CA บน 8.2-8.4)
ถ้ายังเห็น warning หลัง publish config ใหม่ทับ ให้แก้บล็อก mysql และ mariadb
ในไฟล์นั้นให้เป็น:
    (defined('Pdo\Mysql::ATTR_SSL_CA') ? \Pdo\Mysql::ATTR_SSL_CA : PDO::MYSQL_ATTR_SSL_CA) => env('MYSQL_ATTR_SSL_CA'),

---------------------------------------------------------------------------
[F] Vite / หน้าเว็บโหลดไม่ขึ้น, asset 404, "Unable to locate file in Vite manifest"
---------------------------------------------------------------------------
- ตอน dev ต้องรัน  npm run dev  (หรือ composer run dev) ค้างไว้ และเปิดเว็บที่ :8000
- อย่าเปิดที่ :5173 ตรง ๆ
- ถ้าจะรันแบบ production-like:  npm run build  แล้วค่อยเปิด

---------------------------------------------------------------------------
[G] Port ถูกใช้อยู่ "Address already in use" (8000 หรือ 5173)
---------------------------------------------------------------------------
หา process ที่จองพอร์ตแล้วปิด:
    lsof -nP -iTCP:8000 -sTCP:LISTEN
    lsof -nP -iTCP:5173 -sTCP:LISTEN
    kill <PID>
หรือเปลี่ยนพอร์ต serve:  php artisan serve --port=8001

---------------------------------------------------------------------------
[H] MCP server "laravel-boost" ใน Claude Code ขึ้น failed / Connection closed
---------------------------------------------------------------------------
สาเหตุ: ยังไม่ได้ composer install → ไม่มีคำสั่ง php artisan boost:mcp
แก้:
    composer install
    # แล้ว restart Claude Code (หรือ /mcp -> retry)
ตรวจว่าคำสั่งมีแล้ว:  php artisan list | grep boost

---------------------------------------------------------------------------
[I] เปลี่ยน .env แล้วไม่มีผล
---------------------------------------------------------------------------
Laravel cache config ไว้ เคลียร์ด้วย:
    php artisan config:clear
    php artisan cache:clear
(และถ้าเคยรัน config:cache ตอน prod อย่าใช้บน dev)

---------------------------------------------------------------------------
[J] เริ่มใหม่ทั้งหมด (รีเซ็ต database)
---------------------------------------------------------------------------
    php artisan migrate:fresh --seed
หรือผ่านสคริปต์:
    bash docs/install-server-dev/install-dev.sh --fresh --seed


===========================================================================
 6) คำสั่งที่ใช้บ่อย
===========================================================================
    composer run dev                 # รัน server + queue + vite พร้อมกัน
    php artisan serve                # เฉพาะ backend
    npm run dev                      # เฉพาะ vite (assets/HMR)
    php artisan migrate              # อัปเดต schema
    php artisan migrate:fresh --seed # ล้าง + ใส่ข้อมูลใหม่
    php artisan db:seed              # ใส่ข้อมูลตัวอย่าง
    php artisan config:clear         # เคลียร์ config cache
    php artisan tinker               # REPL ทดสอบโค้ด/ข้อมูล

===========================================================================

-- DB SCHEMA;
CREATE TABLE `wholesalers` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    PRIMARY KEY (`id`)
)CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `books`(
    `id` int NOT NULL AUTO_INCREMENT,
    `title` varchar(80) NOT NULL,
    `wholesaler_id` int NOT NULL,
    `wholesale_price` int NOT NULL,
    `price` int NOT NULL,
    `quantity` int NOT NULL,
    `sold` int NOT NULL,
PRIMARY KEY (`id`))
AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `payments`(
    `id` int AUTO_INCREMENT,
    `student_name` varchar(80) NOT NULL,
    `book_id` int NOT NULL,
    `amount` int NOT NULL,
    `date` bigint NOT NULL,
    `payment_date` bigint,
    PRIMARY KEY (`id`)
) CHARSET=utf8mb4 AUTO_INCREMENT=0 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `total_payments` (
    `amount` int DEFAULT 0
)CHARSET=utf8mb4;

CREATE TABLE `school_payoffs` (
    `id` int NOT NULL AUTO_INCREMENT,
    `wholesaler_id` int NOT NULL,
    `amount` int NOT NULL,
    PRIMARY KEY (`id`))
AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `total_school_payoffs` (
    `amount` int DEFAULT 0
)CHARSET=utf8mb4;

CREATE TABLE `locations` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    `address` varchar(80) NOT NULL,
    `areacode` int NOT NULL,
    `municipality` varchar(80) NOT NULL,
    `manager` varchar(80),
    `email` varchar(80),
    `telephones` varchar(80) NOT NULL,
    `priority` int NOT NULL DEFAULT 1,
    `image` varchar(80),
    `map` varchar(400) NOT NULL,
    `link` varchar(200),
    `youtube` varchar(120),
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teachers` (
    `id` int NOT NULL AUTO_INCREMENT,
    `fullname` varchar(80) NOT NULL,
    `email` varchar(80),
    `telephone` varchar(80),
    `linktree` varchar(80),
    `picture` varchar(20),
    `cv` varchar(20),
    `visible` boolean NOT NULL DEFAULT 1,
    `online` boolean NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `class_type` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `instruments` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    `type` varchar(4) NOT NULL, 
    `isInstrument` boolean NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0;

CREATE TABLE `teacher_instruments`(
    `teacher_id` int NOT NULL,
    `instrument_id` int NOT NULL,
    PRIMARY KEY (`teacher_id`, `instrument_id`)
);

CREATE TABLE `teacher_locations` (
    `teacher_id` int NOT NULL,
    `location_id` int NOT NULL,
    PRIMARY KEY (`teacher_id`, `location_id`)
);

CREATE TABLE `teacher_classes` (
    `teacher_id` int NOT NULL,
    `class_id` int NOT NULL,
    `priority` int NOT NULL DEFAULT 1,
    PRIMARY KEY (`teacher_id`, `class_id`)
);

INSERT INTO class_type (name) VALUES ('Βυζαντινή Μουσική');
INSERT INTO class_type (name) VALUES ('Παραδοσιακή Μουσική');
INSERT INTO class_type (name) VALUES ('Ευρωπαϊκή Μουσική');

CREATE TABLE `total_registrations` (
    `amount` int DEFAULT 0,
    `year` int NOT NULL
);

INSERT INTO total_registrations (amount, year) VALUES (0, 2023);

CREATE TABLE `registrations`(
    `id` int AUTO_INCREMENT,
    `am` varchar(4) NOT NULL,
    `last_name` varchar(80) NOT NULL,
    `first_name` varchar(80) NOT NULL,
    `fathers_name` varchar(80) NOT NULL,
    `birth_date` bigint NOT NULL,
    `road` varchar(80) NOT NULL,
    `number` int NOT NULL,
    `tk` int NOT NULL,
    `region` varchar(80) NOT NULL,
    `telephone` varchar(20) DEFAULT "-",
    `cellphone` varchar(20) NOT NULL,
    `email` varchar(80) NOT NULL,
    `registration_year` varchar(12) NOT NULL,
    `class_year` varchar(40) NOT NULL,
    `class_id` int NOT NULL,
    `teacher_id` int NOT NULL,
    `instrument_id` int DEFAULT 0,
    `date` bigint NOT NULL,
    `payed` int DEFAULT 0,
    `total_payment` int DEFAULT 0,
    `payment_date` bigint DEFAULT 0,
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 0 - simple admin - 1 - super admin - 2 - root admin;
CREATE TABLE `sys_users` (
    `id` int NOT NULL AUTO_INCREMENT,
    `email` varchar(80) NOT NULL,
    `password` varchar(80) NOT NULL,
    `session_id` varchar(40),
    `session_exp_date` bigint,
    `privilege` int NOT NULL DEFAULT 0,
    `last_reg_check_id` int NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`, `email`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO sys_users (email, password, privilege) VALUES ('koxafis@gmail.com', 'Whereiswaldo!09', 2);
INSERT INTO sys_users (email, password, privilege) VALUES ('sotiris_ale@hotmail.com', '1234', 1);

CREATE TABLE `sys_user_register_links` (
    `link` varchar(80) NOT NULL,
    `exp_date` bigint NOT NULL,
    `privilege` int NOT NULL,
    PRIMARY KEY (`link`)
)DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO instruments (name, type) VALUES ('Ούτι', "par");
INSERT INTO instruments (name, type) VALUES ('Λαούτο', "par");
INSERT INTO instruments (name, type) VALUES ('Πολίτικο Λαούτο', "par");
INSERT INTO instruments (name, type) VALUES ('Πανδουρίδα - Ταμπούρ', "par");
INSERT INTO instruments (name, type) VALUES ('Πανδουρίδα - Ταμπουράς', "par");
INSERT INTO instruments (name, type) VALUES ('Μαντολίνο', "par");
INSERT INTO instruments (name, type) VALUES ('Σαντούρι', "par");
INSERT INTO instruments (name, type) VALUES ('Τσίμπαλο', "par");
INSERT INTO instruments (name, type) VALUES ('Κανονάκι', "par");
INSERT INTO instruments (name, type) VALUES ('Πολίτικη Λύρα', "par");
INSERT INTO instruments (name, type) VALUES ('Βιολοντσέλο', "par");
INSERT INTO instruments (name, type) VALUES ('Βιολί', "par");
INSERT INTO instruments (name, type) VALUES ('Νέι', "par");
INSERT INTO instruments (name, type) VALUES ('Κλαρίνο', "par");
INSERT INTO instruments (name, type) VALUES ('Φλογέρα - Σουραύλι', "par");
INSERT INTO instruments (name, type) VALUES ('Σύριγγα Πανός (μουσκάλι)', "par");
INSERT INTO instruments (name, type) VALUES ('Τρομπέτα', "par");
INSERT INTO instruments (name, type) VALUES ('Σαξόφωνο', "par");
INSERT INTO instruments (name, type) VALUES ('Τρομπόνι', "par");
INSERT INTO instruments (name, type) VALUES ('Παραδοσιακά μεμβρανόφωνα κρουστά', "par");
INSERT INTO instruments (name, type) VALUES ('Κρητική λύρα', "par");
INSERT INTO instruments (name, type) VALUES ('Ποντιακή λύρα', "par");
INSERT INTO instruments (name, type) VALUES ('Λύρα Ανατολικού Αιγαίου', "par");
INSERT INTO instruments (name, type) VALUES ('Λύρα Θράκης και Μακεδονίας', "par");
INSERT INTO instruments (name, type) VALUES ('Άσκαυλος', "par");
INSERT INTO instruments (name, type) VALUES ('Ζουρνάς', "par");
INSERT INTO instruments (name, type) VALUES ('Μπουζούκι', "par");
INSERT INTO instruments (name, type) VALUES ('Λαϊκή κιθάρα', "par");
INSERT INTO instruments (name, type) VALUES ('Ακκορντεόν', "par");
INSERT INTO instruments (name, type, isInstrument) VALUES ('Σολφέζ', "eur", 0);
INSERT INTO instruments (name, type, isInstrument) VALUES ('Φωνητική - Ορθοφωνία', "eur", 0);
INSERT INTO instruments (name, type, isInstrument) VALUES ('Θεωρία Ευρωπαϊκής Μουσικής', "eur", 0);
INSERT INTO instruments (name, type) VALUES ('Πιάνο', "eur", 0);
INSERT INTO instruments (name, type) VALUES ('Αρμόνιο', "eur", 0);

CREATE TABLE email_subscriptions (
    `email` varchar(80) NOT NULL,
    `unsubscribe_token` varchar(16) NOT NULL,
    `unrelated` boolean NOT NULL DEFAULT 0,
    PRIMARY KEY (`email`)
)DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE query_logs (
    `id` varchar(20) NOT NULL UNIQUE,
    `query` varchar(400) NOT NULL,
    `args` varchar(400) NOT NULL,
    `date` bigint NOT NULL,
    `error` boolean NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
)DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
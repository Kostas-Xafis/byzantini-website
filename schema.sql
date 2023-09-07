-- DROP TABLES;

DROP TABLE IF EXISTS `total_registrations`;
DROP TABLE IF EXISTS `registrations`;
DROP TABLE IF EXISTS `books`;
DROP TABLE IF EXISTS `wholesalers`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `total_payments`;
DROP TABLE IF EXISTS `school_payoffs`;
DROP TABLE IF EXISTS `total_school_payoffs`;
DROP TABLE IF EXISTS `locations`;
DROP TABLE IF EXISTS `teachers`;
DROP TABLE IF EXISTS `instruments`;
DROP TABLE IF EXISTS `class_type`;
DROP TABLE IF EXISTS `teacher_classes`;
DROP TABLE IF EXISTS `teacher_locations`;
DROP TABLE IF EXISTS `teacher_instruments`;
DROP TABLE IF EXISTS `files`;
DROP TABLE IF EXISTS `sys_users`;
DROP TABLE IF EXISTS `sys_user_register_links`;
DROP TABLE IF EXISTS `email_subscriptions`;

-- DB SCHEMA;
CREATE TABLE `wholesalers` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    PRIMARY KEY (`id`)
)CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO wholesalers (name) VALUES ('George Orwell');
INSERT INTO wholesalers (name) VALUES ('F. Scott Fitzgerald');
INSERT INTO wholesalers (name) VALUES ('Frances Hodgson Burnett');
INSERT INTO wholesalers (name) VALUES ('Harper Lee');
INSERT INTO wholesalers (name) VALUES ('J.K. Rowling');
INSERT INTO wholesalers (name) VALUES ('Jane Austen');
INSERT INTO wholesalers (name) VALUES ('J.R.R. Tolkien');
INSERT INTO wholesalers (name) VALUES ('J.D. Salinger');
INSERT INTO wholesalers (name) VALUES ('Paulo Coelho');


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

INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("1984", 1, 13, 15, 30, 10);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Great Gatsby", 2, 9, 12, 40, 15);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Lord of the Rings", 7, 20, 25, 45, 24);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Secret Garden", 3, 16, 20, 50, 20);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("1986", 1, 13, 15, 30, 25);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("To Kill a Mockingbird", 4, 10, 13, 20, 11);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Sad Gatsby", 2, 9, 12, 40, 27);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("Harry Potter and the Sorcerer's Stone", 5, 15, 17, 60, 47);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("Pride and Prejudice", 6, 8, 10, 25, 16);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Hobbit", 7, 12, 15, 35, 12);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Catcher in the Rye", 8, 11, 14, 15, 12);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Alchemist", 9,  10, 12, 30, 18);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Rock of the Rings", 7, 20, 25, 45, 23);

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

INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Jane Smith", 1, 15, 1686580302600);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("John Doe", 2, 12, 1686580312655);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Michael Johnson", 3, 25, 1686580312657);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Emily Davis", 4, 20, 1686580312658);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Daniel Wilson", 6, 13, 1686580312659);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Olivia Thompson", 6, 13, 1686580312660);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("William Martinez", 8, 17, 1686580312661);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Sophia Anderson", 8, 17, 1686580312662);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("James Taylor", 10, 15, 1686580312663);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Emma Hernandez", 10, 15, 1686580312664);

INSERT INTO total_payments (amount) SELECT SUM(amount) FROM payments;

CREATE TABLE `school_payoffs` (
    `id` int NOT NULL AUTO_INCREMENT,
    `wholesaler_id` int NOT NULL,
    `amount` int NOT NULL,
    PRIMARY KEY (`id`))
AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `total_school_payoffs` (
    `amount` int DEFAULT 0
)CHARSET=utf8mb4;

INSERT INTO school_payoffs (wholesaler_id, amount) SELECT wholesaler_id, SUM((quantity-sold)*wholesale_price) FROM books GROUP BY wholesaler_id;

INSERT INTO total_school_payoffs (amount) SELECT SUM(amount) FROM school_payoffs;

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
    `birth_date` int NOT NULL,
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
    `payment_amount` int DEFAULT 0,
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
INSERT INTO instruments (name, type) VALUES ('Πιάνο', "eur");
INSERT INTO instruments (name, type) VALUES ('Αρμόνιο', "eur");


CREATE TABLE email_subscriptions (
    `email` varchar(80) NOT NULL,
    `unsubscribe_token` varchar(16) NOT NULL,
    PRIMARY KEY (`email`)
)DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ALTER TABLE `locations` ADD COLUMN `manager` varchar(80) AFTER `municipality`;
-- ALTER TABLE `locations` MODIFY COLUMN `email` varchar(80);
-- ALTER TABLE `instruments` ADD COLUMN `isInstrument` boolean NOT NULL DEFAULT 1 AFTER `type`;
-- ALTER TABLE `teacher_classes` ADD COLUMN `priority` int NOT NULL DEFAULT 0 AFTER `class_id`;

-- UPDATE instruments SET isInstrument=0 WHERE name='Σολφέζ' AND type="eur";
-- UPDATE instruments SET isInstrument=0 WHERE name='Φωνητική - Ορθοφωνία' AND type="eur";
-- UPDATE instruments SET isInstrument=0 WHERE name='Θεωρία Ευρωπαϊκής Μουσικής' AND type="eur";

-- ALTER TABLE `teachers` ADD COLUMN `email` varchar(80);
-- ALTER TABLE `teachers` ADD COLUMN `telephone` varchar(80);
-- ALTER TABLE `teachers` ADD COLUMN `linktree` varchar(80);

-- ALTER TABLE `registrations` RENAME COLUMN `birth_year` TO `birth_date`;
-- ALTER TABLE `locations` ADD COLUMN `youtube` varchar(120);

-- ALTER TABLE registrations ADD COLUMN birth_date int NOT NULL AFTER email;

-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('Sjjddj', 'Dnjdjd', '000', 'Ndjdkdk', '-', '95959595', 'dsaf@asdffsa.as', 967161600000, 'Rjrjfjfk', 56, 98656, 'Hdjdjfj', "2023-2024", "Γ' Ετος", 34, 0, 0, 1693417795772);
-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('asdasfd', 'sadfasdf', '000', 'asdjfafsd', '125905', '21521351', "aslkdjggd@askjdj.com", 918777600000, "asdjgksjadg", 1250, 21059,"gasdgs", "2023-2024", "Δ' Ετος", 31, 0, 0, 1693394532814);
-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('ΠΕΛΕΚΗ', 'Αικατερίνη', '000', 'Χριστόφορος', '2106131194', '6973490962', "cpeleki@icloud.com", 70502400000, "ΕΦΕΣΟΥ", 1, 15236, "ΝΕΑ ΠΕΝΤΕΛΗ", "2023-2024", "Β' Ετος", 28, 0, 0, 1693400495166);
-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('Κουρτέση' , 'Αικατερίνη' , '000', 'Σπυρίδων' , '2102510251', '6976402019', "katkourtesi@gmail.com", -160704000000, "Αδριανού" , 12, 14341, "Νέα Φιλαδέλφεια", "2023-2024", "Β' Ετος", 28, 0, 0, 1693403193388);
-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('ΣΙΔΕΡΗΣ', 'ΔΗΜΗΤΡΙΟΣ', '000', 'ΚΩΝΣΤΑΝΤΙΝΟΣ', '2102818990', '6908612455', "siderisdd@gmail.com", -209174400000, "ΜΙΑΟΥΛΗ", 18, 14122, "Αττικής", "2023-2024", "Γ' Ετος", 19, 0, 0, 1693394702348);
-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('ΑΛΙΑΪ' , 'ΣΙΝΤΟΡΕΛΑ' , '000', 'Αγκιμ' , '-', '6937517301', "eirhnhlerra228@yahoo.com", 457056000000, "Σμύρνης", 15, 14123, "Λυκόβρυση" , "2023-2024", "Γ' Ετος", 28, 0, 0, 1693402399270);
-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('Αλεβιζάκης', 'Χρίστος Εφραίμ', '000', 'Σωτήριος', "-", '694 3735559', "xristos.ef.ale@gmail.com", 1323993600000,  "Πήγασου", 24, 13675, "Αχαρνές", "2023-2024", "Α' Μέση", 3, 1, 9, 1693418152844);
-- INSERT INTO registrations (last_name, first_name, am, fathers_name, telephone, cellphone, email, birth_date, road, number, tk, region, registration_year, class_year, teacher_id, class_id, instrument_id, date) VALUES ('Ξοφάκης', 'Γεώργιος', '737', 'Χαράλαμπος' , '2102482854', '6972522484', "gxophakes@gmail.com", 1062806400000, "Ιωάννη Καποδίστρια" , 55, 13341, "Άνω Λιόσια", "2023-2024", "Β' Ετος", 1, 0, 0, 1693419238997);

-- Initial schema (derived from dbSnapshots/dev-snapshot.sql, Phase 3 D1 migration)

CREATE TABLE `announcements` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `title` varchar(255) NOT NULL ,  `content` text NOT NULL ,  `date` integer NOT NULL ,  `views` integer NOT NULL DEFAULT '0' , links text NOT NULL DEFAULT '');

CREATE TABLE `books` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `title` varchar(80) NOT NULL ,  `wholesaler_id` integer NOT NULL ,  `wholesale_price` integer NOT NULL ,  `price` integer NOT NULL ,  `quantity` integer NOT NULL ,  `sold` integer NOT NULL );

CREATE TABLE `class_type` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `name` varchar(80) NOT NULL );

CREATE TABLE `email_subscriptions` ( `email` varchar(80) NOT NULL ,  `unsubscribe_token` varchar(16) NOT NULL ,  `unrelated` integer NOT NULL DEFAULT '0' ,  PRIMARY KEY (`email`) );

CREATE TABLE `instruments` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `name` varchar(80) NOT NULL ,  `type` varchar(4) NOT NULL ,  `isInstrument` integer NOT NULL DEFAULT '1' );

CREATE TABLE `locations` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `name` varchar(100) NOT NULL ,  `address` varchar(80) NOT NULL ,  `areacode` integer NOT NULL ,  `municipality` varchar(80) NOT NULL ,  `manager` varchar(80) DEFAULT NULL ,  `email` varchar(80) DEFAULT NULL ,  `telephones` varchar(80) NOT NULL ,  `priority` integer NOT NULL DEFAULT '1' ,  `image` varchar(120) DEFAULT NULL ,  `map` varchar(400) NOT NULL ,  `link` varchar(200) DEFAULT NULL ,  `youtube` varchar(120) DEFAULT NULL ,  `partner` integer DEFAULT '0' );

CREATE TABLE `payments` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `student_name` varchar(80) NOT NULL ,  `book_id` integer NOT NULL ,  `amount` integer NOT NULL ,  `book_amount` integer DEFAULT '1' ,  `date` integer NOT NULL ,  `payment_date` integer DEFAULT '0' );

CREATE TABLE `query_logs` ( `id` varchar(20) NOT NULL ,  `query` varchar(400) NOT NULL ,  `args` varchar(400) NOT NULL ,  `date` integer NOT NULL ,  `error` integer NOT NULL DEFAULT '0' ,  PRIMARY KEY (`id`) ,  UNIQUE (`id`) );

CREATE TABLE `school_payoffs` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `wholesaler_id` integer NOT NULL ,  `amount` integer NOT NULL );

CREATE TABLE `sys_users` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `email` varchar(80) NOT NULL ,  `password` varchar(100) NOT NULL ,  `session_id` varchar(40) DEFAULT NULL ,  `session_exp_date` integer DEFAULT NULL );

CREATE TABLE `teacher_classes` ( `teacher_id` integer NOT NULL ,  `class_id` integer NOT NULL ,  `priority` integer NOT NULL DEFAULT '1' ,  `registration_number` varchar(40) DEFAULT NULL ,  PRIMARY KEY (`teacher_id`,`class_id`) );

CREATE TABLE `teacher_instruments` ( `teacher_id` integer NOT NULL ,  `instrument_id` integer NOT NULL ,  PRIMARY KEY (`teacher_id`,`instrument_id`) );

CREATE TABLE `teacher_locations` ( `teacher_id` integer NOT NULL ,  `location_id` integer NOT NULL ,  PRIMARY KEY (`teacher_id`,`location_id`) );

CREATE TABLE `teachers` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `fullname` varchar(80) NOT NULL ,  `picture` varchar(80) DEFAULT NULL ,  `cv` varchar(80) DEFAULT NULL ,  `email` varchar(80) DEFAULT NULL ,  `telephone` varchar(80) DEFAULT NULL ,  `linktree` varchar(80) DEFAULT NULL ,  `gender` varchar(1) DEFAULT 'M' ,  `title` integer DEFAULT '0' ,  `visible` integer NOT NULL DEFAULT '1' ,  `online` integer NOT NULL DEFAULT '0' , amka VARCHAR(11) NOT NULL DEFAULT '');

CREATE TABLE `total_payments` ( `amount` integer DEFAULT '0' );

CREATE TABLE `total_registrations` ( `amount` integer DEFAULT '0' ,  `year` integer NOT NULL );

CREATE TABLE `total_school_payoffs` ( `amount` integer DEFAULT '0' );

CREATE TABLE `wholesalers` ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `name` varchar(80) NOT NULL );

CREATE TABLE "sys_user_register_links"(
  exp_date INT,
  link varchar(64) NOT NULL);

CREATE TABLE "announcement_images" (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, announcement_id integer, name text, is_main integer);

CREATE TABLE "registrations" ( `id` integer NOT NULL PRIMARY KEY AUTOINCREMENT ,  `am` varchar(10) NOT NULL ,  `last_name` varchar(80) NOT NULL ,  `first_name` varchar(80) NOT NULL ,  `fathers_name` varchar(80) NOT NULL ,  `birth_date` integer NOT NULL ,  `road` varchar(80) NOT NULL ,  `number` integer NOT NULL ,  `tk` integer NOT NULL ,  `region` varchar(80) NOT NULL ,  `telephone` varchar(20) DEFAULT '-' ,  `cellphone` varchar(20) NOT NULL ,  `email` varchar(80) NOT NULL ,  `registration_year` varchar(12) NOT NULL ,  `class_year` varchar(40) NOT NULL ,  `class_id` integer NOT NULL ,  `teacher_id` integer NOT NULL ,  `instrument_id` integer DEFAULT '0' ,  `date` integer NOT NULL ,  `payment_amount` integer DEFAULT '0' ,  `total_payment` integer DEFAULT '0' ,  `payment_date` integer DEFAULT NULL , pass INT NOT NULL DEFAULT 0, registration_url VARCHAR(32) NOT NULL DEFAULT '', amka VARCHAR(11) NOT NULL DEFAULT '');

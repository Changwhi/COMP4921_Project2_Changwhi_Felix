const router = require("express").Router();
const MongoStore = require("connect-mongo");
const session = require("express-session");
const Joi = require("joi");
const bcrypt = require("bcrypt");
require("dotenv").config();
// mySQL
const db_users = include('database/users');
const saltRounds = 12;
const expireTime = 60 * 60 * 1000; // session expire time, persist for 1 hour.

// For messages
const db_messages = include('database/threads');

const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;


const passwordSchema = Joi.object({
  password: Joi.string().pattern(/(?=.*[a-z])/).pattern(/(?=.*[A-Z])/).pattern(/(?=.*[!@#$%^&*])/).pattern(/(?=.*[0-9])/).min(12).max(50).required()
});
const mongoSanitize = require("express-mongo-sanitize");


var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@cluster1.5f9ckjd.mongodb.net/COMP4921_Project1_DB?retryWrites=true&w=majority`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

router.use(
  session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true,
  })
);
function isValidSession(req) {
  console.log("isValidSession")
  if (req.session.authenticated) {
    return true;
  }
  return false;
}

function sessionValidation(req, res, next) {
  console.log("hit sessionValidation")
  if (!isValidSession(req)) {
    res.locals.isLoggedIn = req.session.authenticated === true;
    req.session.destroy();
    res.redirect('/login');
    return;
  }
  else {
    res.locals.isLoggedIn = req.session.authenticated === true;
    next();
  }
}

router.get("/", async (req, res) => {
  console.log("idex page hit")
  const responseData = await db_messages.getRootMessages();
  console.log("router / " + responseData)
  const isLoggedIn = isValidSession(req)

  const top3messages = await db_messages.getTop3Message();
  // const top3messagesData = JSON.stringify(top3messages)
  console.log("dherhaer :" + top3messages[0][0].title)
  res.render("index", { isLoggedIn: isLoggedIn, rootMessages: responseData[0], top3message: top3messages[0] })
})



// Sign up and Login

router.get("/login", async (req, res) => {
  const isLoggedIn = isValidSession(req)
  res.render("login", { isLoggedIn: isLoggedIn, message: null });

});

router.get('/logout', (req, res) => {
  console.log("Logging out");

  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Failed to log out');
    }

    res.redirect('/login');
  });
});

router.get("/signup", async (req, res) => {
  console.log("checking" + req.query.invalid)
  var invalid = req.query.invalid === undefined ? true : req.query.invalid;
  res.render("signup", { invalid: invalid, isLoggedIn: false });

});

router.post("/loggingin", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;
  var users = await db_users.getUsers();
  let user;

  for (let i = 0; i < users.length; i++) {
    if (users[i].email == email) {
      user = users[i];
      break;
    }
  }

  if (user === undefined) {
    res.render('login', { message: "Why did you enter the wrong email?!", isLoggedIn: false });
    return;
  }

  const validationResult = passwordSchema.validate({ password: password });
  if (validationResult.error) {
    let errorMsg = validationResult.error.details[0].message;

    if (errorMsg.includes("(?=.*[a-z])")) {
      errorMsg = "Password must have at least 1 lowercase.";
    } else if (errorMsg.includes("(?=.*[A-Z])")) {
      errorMsg = "Password must have at least 1 uppercase.";
    } else if (errorMsg.includes("(?=.*[!@#$%^&*])")) {
      errorMsg = "Password requires 1 special character.";
    } else if (errorMsg.includes("(?=.*[0-9])")) {
      errorMsg = "Password needs to have 1 number.";
    } else {
      errorMsg = null;
    }

    res.render("error", { message: errorMsg, isLoggedIn: false });
    return;
  }

  const isValidPassword = bcrypt.compareSync(password, user.hashed_password);
  if (isValidPassword) {
    req.session.userID = user.user_id;
    console.log(user.user_id, "+in loggedin");
    req.session.authenticated = true;
    req.session.email = email;
    req.session.cookie.maxAge = expireTime;
    res.redirect("/")
  } else {
    req.session.authenticated = false;
    res.redirect('/login');
  }
});


// User creation
router.post("/submitUser", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;
  var name = req.body.name;
  var hashedPassword = bcrypt.hashSync(password, saltRounds);

  const validationResult = passwordSchema.validate({ password });

  if (validationResult.error) {
    let errorMsg = validationResult.error.details[0].message;

    if (errorMsg.includes("(?=.*[a-z])")) {
      errorMsg = "Password must have at least 1 lowercase.";
    } else if (errorMsg.includes("(?=.*[A-Z])")) {
      errorMsg = "Password must have at least 1 uppercase.";
    } else if (errorMsg.includes("(?=[!@#$%^&*])")) {
      errorMsg = "Password requires 1 special character.";
    } else if (errorMsg.includes("(?=.*[0-9])")) {
      errorMsg = "Password needs to have 1 number.";
    }
    res.render("signup", { message: errorMsgPW, isLoggedIn: false });
    return;
  } else {
    var success = await db_users.createUser({ email: email, hashedPassword: hashedPassword, name: name });

    if (success) {
      res.render("index", { isLoggedIn: true })
    } else {
      res.render('error', { message: `Failed to create the user ${email}, ${name}`, title: "User creation failed" });
    }
  }
});

router.get('/profile', (req, res) => {
  res.render('profile', { message: "Profile", isLoggedIn: false })
})


router.get('/threads', async (req, res) => {
  const root_id = req.query.root_id;
  const responseData = await db_messages.getMessageWithChilds(root_id);
  const isLoggedIn = isValidSession(req);
  const user_id = req.session.userID;
  if (user_id == "undefined") {
    user_id = null;
  }
  res.render('thread', { isLoggedIn: isLoggedIn, user_id: user_id, messages: responseData[0], root_thread_id: root_id });
});

router.post('/submitReply', sessionValidation, async (req, res) => {
  try {
    const replyText = req.body.replyText;
    const replyTitle = req.body.replyTitle;
    const path_length = parseInt(req.body.path_length) + 1;
    const commentId = req.body.commentId;
    const root_thread_id = req.body.rootThreadId;
    const user_id = req.session.userID;
    const response1 = await db_messages.addMessage({ text: replyText, title: replyTitle, user_id: user_id });
    const message_id = JSON.stringify(response1[0].insertId);
    const current_parent_id = commentId;
    const response2 = await db_messages.addClosureTable({ path_length: path_length, message_id: message_id, current_parent_id: current_parent_id });
    console.log(JSON.stringify(response2));

    res.redirect('/threads?root_id=' + root_thread_id);

  } catch (err) {
    console.log("Submiting replay is wrong" + err)
  }

});

router.get('/remove/message', sessionValidation, async (req, res) => {
  const id = req.query.id;
  const root_id = req.query.root_id;
  const response = await db_messages.removeMessage({ text_id: id });
  console.log("Id : " + id)
  if (response) {
    res.redirect(`/threads?root_id=` + root_id)
    return;
  }
  res.render('error', { message: `Fail to remove message..` });
  return;
})

router.get('/likes', sessionValidation, async (req, res) => {
  const id = req.query.id;
  const root_id = req.query.root_id;
  const response = await db_messages.incrementLikes({ text_id: id });
  if (response) {
    res.redirect(`/threads?root_id=` + root_id)
    return;
  }
  res.render('error', { message: `Fail to increament likes` });
  return;
})

module.exports = router;


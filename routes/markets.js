const router = require('express').Router();

router.get('/', (req, res) => res.render('markets'));

module.exports = router;

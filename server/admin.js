require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

async function makeAdmin() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/carbon_ledger');
  
  const users = await User.find().select('email role');
console.log(users);
  const result = await User.updateOne(
    { email: 'admin@email.com' }, // change this to your email
    { $set: { role: 'admin' } }
  );
  
  console.log(result.modifiedCount ? '✅ Admin set!' : '❌ User not found');
  await mongoose.disconnect();
}



makeAdmin();
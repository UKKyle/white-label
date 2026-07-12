if (process.env.WHITE_LABEL_PROJECT_CONFIRMED !== 'true') {
  console.error('Deployment blocked. Set WHITE_LABEL_PROJECT_CONFIRMED=true before running deployment commands.');
  process.exit(1);
}

console.log('Project confirmation check passed.');

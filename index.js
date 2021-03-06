var fromXml = require('xml2json'),
    protocolify = require('protocolify'),
    validUrl = require('valid-url'),
    getAcheckerResults = require('./lib/getAcheckerResults'),
    ignoreList = require('./lib/ignore.json'),
    getErrorMsg = require('./lib/getErrorMsg');

function ignoreIt(result) {
  if (!result.errorMsg || ignoreList.indexOf(getErrorMsg(result.errorMsg)) > -1) {
    return true;
  }
  return false;
}

function formatReport(status, errors, warnings) {
  return {
    status: status,
    errors: errors,
    potentialProblems: warnings
  };
}

function generateReport(xml) {

  var report,
      results,
      errors = [],
      warnings = [];

  // Strip code tags while preserving any text between them.
  xml = xml.replace(/&lt;code&gt;|&lt;\/code&gt;/ig, '');
  // Strip all decoded HTML entities so the XML parser doesn't explode.
  xml = xml.replace(/&[^\s]*;/ig, '');
  // Remove newlines.
  xml = xml.replace('\n', '');

  report = fromXml.toJson(xml, {object: true, sanitize: false}).resultset;

  // If no problems were found, abort.
  if (!report.results.result) {
    return formatReport(report.summary.status, errors, warnings);
  }

  results = report.results.result instanceof Array
          ? report.results.result
          : [report.results.result];

  results.forEach(function(result) {
    if (ignoreIt(result)) return;
    if (result.resultType === 'Error') {
      errors.push({
        line: result.lineNum,
        column: result.columnNum,
        message: getErrorMsg(result.errorMsg),
        solution: result.repair
      });
    }
    if (result.resultType === 'Potential Problem') {
      warnings.push({
        line: result.lineNum,
        column: result.columnNum,
        message: getErrorMsg(result.errorMsg),
        source: result.errorSourceCode
      });
    }
  });

  return formatReport(report.summary.status, errors, warnings);

}

function validate(opts, cb) {
  opts = opts || {};
  cb = cb || function() {};
  if (!opts.uri) {
    return cb(new Error('No URI provided to test.'));
  }
  if (opts.uri && !validUrl.isWebUri(opts.uri)) {
    return cb(new Error('You supplied an invalid URL.'), null);
  }
  if (!opts.id) {
    return cb(new Error('No AChecker API ID provided. Register at http://achecker.ca/register.php to get an ID.'));
  }
  opts = {
    uri: 'http://achecker.ca/checkacc.php',
    qs: {
      uri: protocolify(opts.uri),
      id: opts.id,
      output: 'rest',
      guide: opts.guide || 'WCAG2-AA'
    }
  };
  getAcheckerResults(opts, function(err, xml) {
    if (err) return cb(new Error(err));
    if (xml.indexOf('Invalid web service ID') > -1) {
      return cb(new Error('Invalid web service ID. Please get your ID from http://achecker.ca/profile/.'));
    }
    var report = generateReport(xml);
    return cb(null, report);
  });
}

module.exports = validate;

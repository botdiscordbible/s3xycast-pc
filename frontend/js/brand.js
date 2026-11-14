/*
 * S3XYCast PC — the S3XYCast edition of MoonlightWeb.
 * Copyright (C) 2026 Bruno Martin <brunoocto@gmail.com> (MoonlightWeb)
 * Modifications for the S3XYCast edition, 2026.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * What this edition is called where the name is written by code rather than
 * by a translation (the login card, the stream bar, the "securing" screen).
 * One place, so that the name is never hunted for again. The texts people read
 * carry it in locales/*.json; the look is css/s3xycast.css.
 */
export const BRAND_NAME = 'S3XYCast PC';

/**
 * The project this edition is made from and its author. Their names are kept,
 * as the project's COPYRIGHT file asks of a fork and as the GPL asks of an
 * interactive program, in one place of the interface: the About window
 * (ui/AboutDialog.js), a click away from the footer. Nowhere else on screen.
 */
export const UPSTREAM_NAME = 'MoonlightWeb';
export const UPSTREAM_AUTHOR = 'Bruno Martin';
export const UPSTREAM_YEAR = '2026';
export const UPSTREAM_URL = 'https://github.com/linckosz/moonlight-web';

/** The licence the program is under, to read in full. */
export const LICENCE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

/**
 * Where this edition's own source is published. Empty until it is: the About
 * window then leaves the link out rather than send the reader to a dead page.
 * It has to be set before the program is handed to anyone (GPL-3.0, §6).
 */
export const EDITION_SOURCE_URL = '';

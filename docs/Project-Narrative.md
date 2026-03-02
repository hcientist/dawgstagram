# Dawgstagram

## Purpose

<!-- Clearly state the main idea and intended purpose of your application.
Explain a problem your application aims to solve and why it is important. -->

<blockquote cite="https://blogs.loc.gov/catbird/2021/01/for-there-is-always-light-amanda-gormans-inaugural-poem-the-hill-we-climb-delivers-message-of-unity/">"For there is always light,<br>if only we're brave enough to see it.<br>If only we're brave enough to be it."</blockquote>

_-Amanda Gorman, Poet and Activist_

While we should commit ourselves to the long, slow, never-ending work of improving ourselves and our world, we can also benefit from small sparks of joy.

**Dawgstagram facilitates personal curation and sharing of canine imagery.**

This is app is for everyone: people who already love 😍 dogs 🐶, and those who will soon!
Its purpose is to facilitate the curation and sharing "dawgs": dog images (with optional visual effects/transformations called "filters").

<!-- I doubt this meets the word count guideline... look at this first result for "vscode word count" https://github.com/microsoft/vscode-wordcount 😆 -->

## Users

<!-- Identify the primary users of your application, including their background or needs.
Justify how your application will benefit these users and improve their experience. -->

Dawgstagram values inclusivity and accessibility ("a11y").
It is designed primarily for people who love dogs and those who will soon love them.

### Background

The intended audience for Dawgstagram is people who can read and/or listen to natural language.
Those without visual impairments will be able to see the _dawgs_, and those with visual impairments will be able to hear the descriptions of the _dawgs_.
The _dawgs_ will include metadata indicating the (natural) languages their creator has added.
Creators may create _dawgs_ in whatever languages they wish.

Dawgstagram is intended to be used by people with and without programming experience.
Those creators without programming experience can apply existing filters to their _dawgs_.
Those creators with programming experience can create new filters to apply to their _dawgs_.

### Needs

The intended users of Dawgstagram include those with needs such as: 

1. to view dogs without filters or with filters (in which case we call them _dawgs_)
2. to share _dawgs_ with friends and family ("framily")

## Features

<!-- Outline the core functionalities of your application and explain how they will work.
Provide a concrete example demonstrating how the application fulfills its purpose. -->

People who use Dawgstagram will:

1. search for dog images by breed and can create, read, update, and delete (<abbr title="Create, Read, Update, Delete">CRUD</abbr>):
    * favorite dog images from
        * the [Dog API](https://dog.ceo/dog-api/)
        * images available via URL elsewhere on the web
    * custom lists of dog images
    * custom "filters" (visual transformations) for dog images
        * in their favorites or other lists, they may have filters applied to the images
2. share links that show the visitor a dog image (potentially with a filter applied)


## Data

<!-- Describe the types of data that users will create, read, update, and delete (CRUD).
Include an example of this data using either real or representative sample values. -->

### Dawg

1. src: string - http(s) url to an image or [data URL](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data) of base-64-encoded image data.
2. handle: string
3. filter: string
4. metadata: object
    1. language (string) keys map to objects with:
        1. title: string
        2. body: string

### DawgList

1. handle: string (`Favorites` is created automatically by Dawgstagram, but other lists can also be created)
2. dawgs: string[] - list of _Dawg_ handles

### Filter

1. handle: string
2. code: string
3. metadata: object
    1. language (string) keys map to objects with:
        1. title: string
        2. description: string
        3. instructions: string

## References

1. [Caman: a CAnvas MANipulation library for Javascript](https://github.com/meltingice/CamanJS)
